import { configureStore } from '@reduxjs/toolkit';
import triageReducer from '../features/triageSlice';
import syncReducer from '../features/syncSlice';

export const store = configureStore({
  reducer: {
    triage: triageReducer,
    sync: syncReducer,
  },
  // Default middleware (thunk + serializability checks) is sufficient here;
  // all state (TriageRecord[], primitives) is plain and serializable.
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;