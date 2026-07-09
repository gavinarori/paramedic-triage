# Paramedic Triage Intake Application

An offline-first mobile application for paramedics to log critical patient
triage data in the field, built for environments with unstable or absent
cellular connectivity. Records are always saved locally first and
automatically synced to the server the moment connectivity is restored —
with zero user intervention required.

Built with **React Native (Expo SDK 54) + TypeScript + Redux Toolkit**.

---

## Table of Contents

- [Demo](#demo)
- [Architecture Overview](#architecture-overview)
- [How the Offline Sync Queue Works](#how-the-offline-sync-queue-works)
- [Project Structure](#project-structure)
- [Setup Instructions](#setup-instructions)
- [Running Tests](#running-tests)
- [Design Decisions & Trade-offs](#design-decisions--trade-offs)
- [Known Limitations](#known-limitations)

---

## Demo

See `demo.gif` in the repository root — it shows:
1. Submitting a triage record while the device is in Airplane Mode (record
   saves instantly, shows a "Pending" badge).
2. Airplane Mode is turned off.
3. The record automatically flips to "Synced" with no user action taken.

---

## Architecture Overview

The application is built around a single non-negotiable principle:
**the UI never talks to storage or the network directly.** Every layer has
exactly one job, and data flows in one direction through the stack:

┌─────────────────────────────────────────────────────────┐
│  UI Layer (screens/, components/)                        │
│  - Renders state, captures input, dispatches actions      │
│  - Knows NOTHING about AsyncStorage, NetInfo, or the API  │
└───────────────────────────┬─────────────────────────────┘
│ dispatch(thunk)
┌───────────────────────────▼─────────────────────────────┐
│  State Layer (features/, store/) — Redux Toolkit          │
│  - triageSlice: CRUD orchestration for triage records      │
│  - syncSlice: projects sync engine status for the UI       │
└───────────────────────────┬─────────────────────────────┘
│ calls
┌───────────────────────────▼─────────────────────────────┐
│  Service Layer (services/)                                │
│  - storage.ts:    AsyncStorage read/write (source of truth)│
│  - api.ts:        mock network calls (POST /api/v1/triage) │
│  - syncService.ts: connectivity monitoring + queue engine  │
└───────────────────────────────────────────────────────────┘

**Why this separation matters for an offline-first app specifically:** if a
component imported `AsyncStorage` directly, every screen that shows triage
data would need to independently know how to save, retry, and reconcile
sync state. By centralizing that in `syncService.ts` and `storage.ts`, the
UI layer only ever needs to read Redux state and dispatch a handful of
thunks (`submitTriage`, `loadTriages`) — all sync complexity is invisible
to it.

### State Management: Redux Toolkit

Two slices, each with a single responsibility:

| Slice | Responsibility |
|---|---|
| `triageSlice` | CRUD for triage records: load, submit (optimistic local save), delete. Talks to `storage.ts`. |
| `syncSlice` | Pure projection of sync engine events (`isOnline`, `isSyncing`, `lastResult`) for UI display. Contains no logic of its own — it's a mirror of what `syncService` reports. |

RTK's `createAsyncThunk` is used for all async flows (load/submit/delete),
giving automatic `pending`/`fulfilled`/`rejected` states without hand-rolled
loading/error booleans scattered across the app.

---

## How the Offline Sync Queue Works

This is the core of the assessment, so here's the exact flow, step by step.

### 1. Every record is saved locally *before* any network attempt

When a paramedic taps **Submit**:

handleSubmit (TriageFormScreen)
→ dispatch(submitTriage(input))
→ build TriageRecord { ..., synced: false, syncAttempts: 0 }
→ storage.saveTriage(record)   ← AWAITED, this MUST succeed first
→ syncService.triggerSync()    ← fire-and-forget, not awaited
→ thunk resolves as soon as local save completes
→ UI shows the record immediately with a "Pending" badge

The thunk resolves the instant `AsyncStorage` write completes — the
paramedic sees confirmation instantly, **regardless of whether the device
has a network connection at that moment.** This satisfies the "offline
interception" requirement: there is no error state for offline submission,
because network status is never checked before saving.

### 2. Every record carries its own sync state

```typescript
interface TriageRecord {
  // ...patient fields
  synced: boolean;        // false until server confirms receipt
  syncAttempts: number;    // incremented on each failed upload
  lastSyncError?: string | null;
}
```

`synced: false` records are the queue. There's no separate "outbox" table —
the pending queue is simply derived by filtering the same records list
(`getPendingTriages()` in `storage.ts`), which keeps storage as a single
source of truth and avoids any risk of the two getting out of sync with
each other.

### 3. `syncService.ts` — the engine

A singleton (`export const syncService = new SyncService()`) that:

- **Subscribes to `NetInfo`** on `start()` (called once, in `App.tsx`).
  The moment connectivity flips from offline → online, it automatically
  calls `triggerSync()` — this is what makes syncing "automatic" per the
  spec, with zero user action required.
- **Subscribes to `AppState`** as well, so if the app was backgrounded
  while offline and connectivity changed while it was suspended (common on
  both iOS and Android, where background network listeners can be
  throttled), a sync is re-attempted the moment the app returns to the
  foreground.
- **Guards against overlapping runs.** If a sync triggered by
  `AppState` fires while a `NetInfo`-triggered sync is still in flight,
  the second call is a no-op (`isSyncing` flag check) — this prevents
  duplicate uploads of the same record.
- **Processes the queue sequentially, not in parallel.** On a genuinely
  poor field connection, parallel uploads would compete for the same
  limited bandwidth and make partial failures much harder to reason
  about. Sequential processing also lets the engine bail out cleanly
  the moment `isOnline` flips back to `false` mid-run, instead of leaving
  several in-flight requests to fail independently.
- **Retries individually, with a cap.** Each record tracks its own
  `syncAttempts`. Records that fail are simply left with `synced: false`
  and will be retried on the *next* sync run (next connectivity event or
  app foreground event) — up to `MAX_RETRY_ATTEMPTS` (5), after which
  they're skipped automatically to avoid infinite retry loops against a
  record the server may be permanently rejecting.

```typescript
// Simplified core loop from syncService.ts
for (const record of pending) {
  if (!this.isOnline) break;                 // stop cleanly if connection drops mid-run
  if (record.syncAttempts >= MAX_RETRY_ATTEMPTS) continue;

  const response = await postTriageRecord(record);
  if (response.success) {
    await storage.updateSyncStatus(record.id, true);
  } else {
    await storage.updateSyncStatus(record.id, false, response.error);
  }
}
```

### 4. UI reflects sync state reactively

`TriageFormScreen` subscribes to `syncService` via
`syncService.subscribe(listener)` and dispatches the results into
`syncSlice`. This means:

- A banner at the top of the screen always shows **Online/Offline** status.
- Each record card shows a **Synced** or **Pending (retry N)** badge.
- A pull-to-refresh gesture is also wired to manually call
  `syncService.triggerSync()`, useful for demoing or for a paramedic who
  wants to force a check without waiting for the automatic listener.

### 5. Mock network layer (`api.ts`)

Per the assessment's allowance to simulate rather than build a live
backend, `postTriageRecord()`:
- Adds an artificial **2-second delay**, representative of a slow/degraded
  field connection.
- Randomly fails **~30% of requests** (`FAILURE_RATE = 0.3`), to
  exercise the retry logic honestly rather than only ever showing the
  happy path.

Swapping this for a real endpoint later is a one-line change — the
function signature (`(record: TriageRecord) => Promise<ApiResponse<...>>`)
is unchanged whether it's mocked or hitting a real
`POST /api/v1/triage`.

---

## Project Structure

src/
├── components/
│   ├── PrioritySelector.tsx   # Color-coded 1–5 priority picker
│   └── TriageForm.tsx         # Presentational form, no storage/network knowledge
├── screens/
│   └── TriageFormScreen.tsx   # Orchestrates form + record list + sync status banner
├── store/
│   └── index.ts               # Redux store configuration
├── features/
│   ├── triageSlice.ts         # CRUD thunks + selectors for triage records
│   └── syncSlice.ts           # Projects sync engine events into Redux state
├── services/
│   ├── api.ts                 # Mock POST /api/v1/triage (2s delay + random failure)
│   ├── storage.ts             # AsyncStorage read/write layer (source of truth)
│   └── syncService.ts         # NetInfo + AppState listeners, queue processing engine
├── utils/
│   ├── colors.ts               # Hazard color palette, priority → color mapping
│   └── validation.ts           # Field + full-form validation
├── types/
│   └── index.ts                 # TriageRecord, NewTriageInput, ValidationResult, etc.
└── tests/
└── triage.test.ts          # Validation + storage/offline persistence unit tests

---

## Setup Instructions

### Prerequisites

- Node.js 20.19.x or later (required by Expo SDK 54)
- npm (or yarn/pnpm/bun — all supported by Expo SDK 54)
- Expo Go app on a physical device, **or** Android Studio / Xcode for an
  emulator/simulator

### Install

```bash
git clone <your-repo-url>
cd paramedic-triage
npm install
```

If you ever add a new Expo/React Native-ecosystem package, install it via
`npx expo install <package>` rather than plain `npm install` — this
resolves the version compatible with your installed Expo SDK automatically
and avoids native/JS version mismatches.

### Run

```bash
npx expo start
```

Then either:
- Scan the QR code with the **Expo Go** app on a physical device (recommended —
  needed to properly test Airplane Mode toggling), or
- Press `a` for Android emulator / `i` for iOS simulator.

### Verify environment health (optional but recommended)

```bash
npx expo-doctor
```

---

## Running Tests

```bash
npm test
```

Covers:
- **Validation logic** (`utils/validation.ts`) — required fields, priority
  range enforcement, missing status handling.
- **Storage/offline persistence** (`services/storage.ts`) — saving,
  retrieving, marking sync success/failure, retry-count incrementing,
  multi-record queue isolation, deletion.

Tests use `@react-native-async-storage/async-storage/jest/async-storage-mock`
so they run fully in-memory with no device/simulator required.

---

## Design Decisions & Trade-offs

| Decision | Reasoning |
|---|---|
| **AsyncStorage over SQLite/WatermelonDB** | For this dataset (single-user, unbounded-but-small local queue of triage records), AsyncStorage's simplicity avoids the schema/migration overhead of a full SQL layer. The `services/storage.ts` interface is intentionally the *only* place that knows this — swapping to MMKV or SQLite later is a same-file, same-signature change with zero impact on Redux or UI. |
| **Sequential sync, not parallel batch upload** | Prioritizes predictability and graceful degradation on poor connections over raw throughput — appropriate for a low-volume, high-stakes data type like triage records. |
| **Sync state stored on each record, not a separate outbox table** | Keeps storage as a single source of truth; the "queue" is just a filter (`synced === false`), so there's no risk of the queue and the record list drifting out of sync with each other. |
| **`syncService` as a singleton class, not a Redux middleware** | NetInfo/AppState listeners are cross-cutting, app-lifetime concerns, not something tied to a specific dispatched action. A singleton service that Redux *subscribes to* (rather than a saga/middleware pattern) keeps the sync engine independently testable and framework-agnostic. |
| **Retry cap (5 attempts) instead of infinite retry** | Prevents a permanently-rejected record (e.g. malformed data server-side) from silently consuming sync cycles forever; failed-out records remain visible via their `lastSyncError` for manual review. |

---

## Known Limitations

- The mock API (`api.ts`) simulates network behavior in-process; no real
  backend is deployed, per the assessment's explicit allowance.
- Retry backoff is currently "next sync trigger" based (event-driven) rather
  than exponential-backoff timed — appropriate given syncs are already
  triggered by real connectivity events rather than polling, but a
  production version might add a timed backoff for records that have
  failed multiple times in a row.
- No authentication/multi-user support — out of scope per the assessment
  brief (single-device, single-paramedic field use case).