import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import 'react-native-get-random-values'; // required for uuid on RN
import { v4 as uuidv4 } from 'uuid';
import { TriageRecord, NewTriageInput } from '../types';
import * as storage from '../services/storage';
import { syncService } from '../services/syncService';

/**
 * Redux slice for triage record CRUD. This is the ONLY layer that talks to
 * `services/storage.ts` for record data — UI components dispatch thunks
 * and read from selectors, never touching AsyncStorage directly.
 */

interface TriageState {
  records: TriageRecord[];
  isLoading: boolean;
  error: string | null;
}

const initialState: TriageState = {
  records: [],
  isLoading: false,
  error: null,
};

/** Load all persisted records on app start (e.g. TriageFormScreen mount) */
export const loadTriages = createAsyncThunk('triage/loadAll', async () => {
  return storage.getAllTriages();
});

/**
 * Core offline-first write path:
 *   1. Build the full record client-side (including a generated UUID).
 *   2. Persist it locally FIRST — this resolves before we touch the network.
 *   3. Fire-and-forget a sync trigger; if offline, syncService simply no-ops
 *      and the record waits safely in the local queue.
 * The thunk resolves as soon as the local save succeeds, so the UI can
 * show an optimistic "Saved" state immediately regardless of connectivity.
 */
export const submitTriage = createAsyncThunk(
  'triage/submit',
  async (input: NewTriageInput) => {
    const record: TriageRecord = {
      id: uuidv4(),
      ...input,
      timestamp: new Date().toISOString(),
      synced: false,
      syncAttempts: 0,
      lastSyncError: null,
    };

    await storage.saveTriage(record);

    // Don't await this — submission should feel instant to the paramedic.
    // If the device is offline, triggerSync() resolves quickly as a no-op.
    void syncService.triggerSync();

    return record;
  },
);

export const deleteTriageRecord = createAsyncThunk(
  'triage/delete',
  async (id: string) => {
    await storage.deleteTriage(id);
    return id;
  },
);

/** Called by the sync engine's status listener to keep Redux in sync with storage */
export const refreshTriages = createAsyncThunk('triage/refresh', async () => {
  return storage.getAllTriages();
});

const triageSlice = createSlice({
  name: 'triage',
  initialState,
  reducers: {
    /** Local optimistic patch, used when the sync engine reports an outcome
     *  without requiring a full reload from storage. */
    recordSyncOutcome(
      state,
      action: PayloadAction<{ id: string; synced: boolean; error?: string | null }>,
    ) {
      const record = state.records.find((r) => r.id === action.payload.id);
      if (record) {
        record.synced = action.payload.synced;
        if (!action.payload.synced) {
          record.syncAttempts += 1;
          record.lastSyncError = action.payload.error ?? record.lastSyncError;
        } else {
          record.lastSyncError = null;
        }
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadTriages.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loadTriages.fulfilled, (state, action) => {
        state.isLoading = false;
        state.records = action.payload;
      })
      .addCase(loadTriages.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message ?? 'Failed to load triage records.';
      })
      .addCase(submitTriage.fulfilled, (state, action) => {
        state.records.unshift(action.payload);
      })
      .addCase(submitTriage.rejected, (state, action) => {
        state.error = action.error.message ?? 'Failed to save triage record.';
      })
      .addCase(deleteTriageRecord.fulfilled, (state, action) => {
        state.records = state.records.filter((r) => r.id !== action.payload);
      })
      .addCase(refreshTriages.fulfilled, (state, action) => {
        state.records = action.payload;
      });
  },
});

export const { recordSyncOutcome } = triageSlice.actions;

// Selectors
export const selectAllTriages = (state: { triage: TriageState }) => state.triage.records;
export const selectPendingTriages = (state: { triage: TriageState }) =>
  state.triage.records.filter((r) => !r.synced);
export const selectTriageLoading = (state: { triage: TriageState }) => state.triage.isLoading;
export const selectTriageError = (state: { triage: TriageState }) => state.triage.error;

export default triageSlice.reducer;