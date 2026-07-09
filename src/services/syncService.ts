import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { AppState, AppStateStatus } from 'react-native';
import { postTriageRecord } from './api';
import { getPendingTriages, updateSyncStatus } from './storage';
import { SyncRunResult } from '../types';

/**
 * ============================================================================
 * OFFLINE SYNC ENGINE
 * ============================================================================
 * This is the heart of the app's offline-first guarantee. Responsibilities:
 *
 * 1. Monitor connectivity via NetInfo. The moment the device regains a
 *    usable connection, automatically kick off a sync run.
 * 2. Process the local "pending" queue (records with synced=false) one at a
 *    time, uploading each via the mock API and updating local storage with
 *    the outcome — success flips `synced`, failure increments retry count.
 * 3. Guard against overlapping runs (e.g. a foreground event firing while a
 *    connectivity-triggered sync is already in progress).
 * 4. React to app foreground/background transitions so a sync is attempted
 *    whenever the app becomes active again, in case connectivity changed
 *    while it was backgrounded (some OSes suspend NetInfo listeners then).
 *
 * The engine intentionally exposes only a small surface (start/stop/
 * triggerSync + a subscribe function for status updates) so that UI and
 * Redux layers never need to know about NetInfo, retry counters, or
 * storage internals — full separation of concerns.
 * ============================================================================
 */

export type SyncListener = (status: {
  isSyncing: boolean;
  isOnline: boolean;
  lastResult?: SyncRunResult;
  lastError?: string;
}) => void;

const MAX_RETRY_ATTEMPTS = 5;

class SyncService {
  private isSyncing = false;
  private isOnline = true;
  private netInfoUnsubscribe: (() => void) | null = null;
  private appStateSubscription: { remove: () => void } | null = null;
  private listeners: Set<SyncListener> = new Set();
  private started = false;

  /** Wire up NetInfo + AppState listeners. Call once, e.g. from app entry point. */
  start(): void {
    if (this.started) return;
    this.started = true;

    this.netInfoUnsubscribe = NetInfo.addEventListener(this.handleConnectivityChange);

    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange,
    );

    // Prime initial connectivity state and attempt a sync in case there
    // are already-pending records from a previous offline session.
    NetInfo.fetch().then((state) => {
      this.isOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
      if (this.isOnline) {
        void this.triggerSync();
      }
    });
  }

  /** Tear down listeners. Call on app unmount (rarely needed in practice for RN apps). */
  stop(): void {
    this.netInfoUnsubscribe?.();
    this.appStateSubscription?.remove();
    this.netInfoUnsubscribe = null;
    this.appStateSubscription = null;
    this.started = false;
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(partial: Partial<Parameters<SyncListener>[0]>): void {
    const payload = {
      isSyncing: this.isSyncing,
      isOnline: this.isOnline,
      ...partial,
    };
    this.listeners.forEach((listener) => listener(payload));
  }

  private handleConnectivityChange = (state: NetInfoState): void => {
    const wasOnline = this.isOnline;
    this.isOnline = Boolean(state.isConnected && state.isInternetReachable !== false);

    this.notify({});

    // The critical offline->online transition: this is what makes the sync
    // "automatic" per the spec — no user action required.
    if (!wasOnline && this.isOnline) {
      void this.triggerSync();
    }
  };

  private handleAppStateChange = (nextState: AppStateStatus): void => {
    if (nextState === 'active') {
      // Re-check connectivity and attempt a sync whenever the app returns
      // to the foreground, covering the case where connectivity changed
      // while backgrounded and the OS throttled our NetInfo listener.
      NetInfo.fetch().then((state) => {
        this.isOnline = Boolean(
          state.isConnected && state.isInternetReachable !== false,
        );
        this.notify({});
        if (this.isOnline) {
          void this.triggerSync();
        }
      });
    }
  };

  /**
   * Processes the pending queue. Safe to call redundantly — an in-flight
   * run will simply be skipped rather than double-processed.
   */
  async triggerSync(): Promise<SyncRunResult | null> {
    if (this.isSyncing) {
      return null; // prevent overlapping sync runs
    }
    if (!this.isOnline) {
      this.notify({ isSyncing: false });
      return null;
    }

    this.isSyncing = true;
    this.notify({ isSyncing: true });

    const result: SyncRunResult = { attempted: 0, succeeded: 0, failed: 0 };

    try {
      const pending = await getPendingTriages();

      // Sequential (not parallel) processing: on a poor field connection,
      // parallel uploads would compete for limited bandwidth and make
      // failures harder to reason about. Sequential also lets us bail out
      // immediately if connectivity drops mid-run.
      for (const record of pending) {
        if (!this.isOnline) break; // connection dropped mid-sync, stop gracefully

        if (record.syncAttempts >= MAX_RETRY_ATTEMPTS) {
          continue; // give up on records that have exhausted retries; surfaced in UI via lastSyncError
        }

        result.attempted += 1;

        try {
          const response = await postTriageRecord(record);
          if (response.success) {
            await updateSyncStatus(record.id, true);
            result.succeeded += 1;
          } else {
            await updateSyncStatus(record.id, false, response.error);
            result.failed += 1;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown sync error';
          await updateSyncStatus(record.id, false, message);
          result.failed += 1;
        }
      }

      this.notify({ isSyncing: false, lastResult: result });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync run failed';
      this.notify({ isSyncing: false, lastError: message });
      return result;
    } finally {
      this.isSyncing = false;
    }
  }

  getSnapshot() {
    return { isSyncing: this.isSyncing, isOnline: this.isOnline };
  }
}

/** Singleton instance — one sync engine per app process, by design. */
export const syncService = new SyncService();