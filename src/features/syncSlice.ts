import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { SyncStatus, SyncRunResult } from '../types';

/**
 * Tracks sync engine status for UI display (banners, badges, spinners).
 * This slice holds NO business logic — it is purely a projection of events
 * emitted by services/syncService.ts, wired up via subscribe() in the
 * screen/app root. Keeping logic out of Redux here preserves the
 * separation between "what happened" (service) and "what the UI shows"
 * (slice).
 */

interface SyncState {
  status: SyncStatus;
  isOnline: boolean;
  lastSyncedAt: string | null;
  lastResult: SyncRunResult | null;
  lastError: string | null;
}

const initialState: SyncState = {
  status: 'idle',
  isOnline: true,
  lastSyncedAt: null,
  lastResult: null,
  lastError: null,
};

const syncSlice = createSlice({
  name: 'sync',
  initialState,
  reducers: {
    setOnlineStatus(state, action: PayloadAction<boolean>) {
      state.isOnline = action.payload;
      if (!action.payload) {
        state.status = 'offline';
      }
    },
    syncStarted(state) {
      state.status = 'syncing';
      state.lastError = null;
    },
    syncFinished(state, action: PayloadAction<SyncRunResult>) {
      state.status = state.isOnline ? 'idle' : 'offline';
      state.lastResult = action.payload;
      state.lastSyncedAt = new Date().toISOString();
    },
    syncFailed(state, action: PayloadAction<string>) {
      state.status = 'error';
      state.lastError = action.payload;
    },
  },
});

export const { setOnlineStatus, syncStarted, syncFinished, syncFailed } = syncSlice.actions;

export const selectSyncStatus = (state: { sync: SyncState }) => state.sync.status;
export const selectIsOnline = (state: { sync: SyncState }) => state.sync.isOnline;
export const selectLastSyncedAt = (state: { sync: SyncState }) => state.sync.lastSyncedAt;
export const selectLastSyncResult = (state: { sync: SyncState }) => state.sync.lastResult;

export default syncSlice.reducer;