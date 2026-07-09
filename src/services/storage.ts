import AsyncStorage from '@react-native-async-storage/async-storage';
import { TriageRecord } from '../types';

/**
 * Local persistence layer — the offline "source of truth" for this app.
 * Every triage record is written here FIRST, before any network activity
 * is attempted. AsyncStorage is used here for simplicity/portability in an
 * assessment context; in a production build this would likely be swapped
 * for MMKV or SQLite/WatermelonDB for better performance at scale, but the
 * interface below would remain identical — nothing outside this file would
 * need to change, which is the point of isolating storage behind a service.
 */

const STORAGE_KEY = '@paramedic_triage/records';

/** Read the full record set from disk. Returns [] if nothing has been saved yet. */
export async function getAllTriages(): Promise<TriageRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TriageRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[storage] Failed to read triage records:', error);
    // Fail safe: never throw here, an empty list is safer than crashing the app
    return [];
  }
}

async function persistAll(records: TriageRecord[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

/**
 * Saves a new triage record locally. This is called immediately on submit,
 * BEFORE any network call — guaranteeing the record survives even if the
 * app is closed or the device loses power right after submission.
 */
export async function saveTriage(record: TriageRecord): Promise<void> {
  const existing = await getAllTriages();
  const updated = [record, ...existing];
  await persistAll(updated);
}

/** Fetch a single record by id */
export async function getTriageById(id: string): Promise<TriageRecord | undefined> {
  const all = await getAllTriages();
  return all.find((r) => r.id === id);
}

/** Update arbitrary fields on an existing record (used for edits) */
export async function updateTriage(
  id: string,
  updates: Partial<TriageRecord>,
): Promise<void> {
  const all = await getAllTriages();
  const updated = all.map((r) => (r.id === id ? { ...r, ...updates } : r));
  await persistAll(updated);
}

/**
 * Marks a record's sync outcome. Called by the sync engine after each
 * upload attempt — success flips `synced` to true; failure increments the
 * retry counter and stores the error for diagnostics.
 */
export async function updateSyncStatus(
  id: string,
  synced: boolean,
  errorMessage?: string,
): Promise<void> {
  const all = await getAllTriages();
  const updated = all.map((r) => {
    if (r.id !== id) return r;
    return {
      ...r,
      synced,
      syncAttempts: synced ? r.syncAttempts : r.syncAttempts + 1,
      lastSyncError: synced ? null : errorMessage ?? r.lastSyncError,
    };
  });
  await persistAll(updated);
}

/** Returns only the records still awaiting upload — the sync engine's work queue */
export async function getPendingTriages(): Promise<TriageRecord[]> {
  const all = await getAllTriages();
  return all.filter((r) => !r.synced);
}

export async function deleteTriage(id: string): Promise<void> {
  const all = await getAllTriages();
  const updated = all.filter((r) => r.id !== id);
  await persistAll(updated);
}

/** Destructive utility, useful for tests and a potential "reset demo data" dev option */
export async function clearAllTriages(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}