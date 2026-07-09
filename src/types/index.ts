/**
 * Core type definitions for the Paramedic Triage Intake Application.
 * Shared across storage, API, Redux, and UI layers.
 */

/** Priority scale: 1 = absolute critical/life-threatening, 5 = least urgent */
export type PriorityLevel = 1 | 2 | 3 | 4 | 5;

/** Lifecycle status of a triage record */
export type TriageStatus = 'Pending' | 'In-Transit';

/**
 * Canonical shape of a single paramedic triage intake record,
 * as stored locally and sent to the server.
 */
export interface TriageRecord {
  /** Client-generated UUID. Never server-assigned, so records can be
   *  created and identified with zero network dependency. */
  id: string;

  patientName: string;
  conditionDescription: string;
  priority: PriorityLevel;
  status: TriageStatus;

  /** ISO 8601 timestamp of on-device creation */
  timestamp: string;

  /** Core flag driving the offline sync queue: false = pending upload */
  synced: boolean;

  /** Failed sync attempt count, used for backoff/retry logic */
  syncAttempts: number;

  /** Last error message from a failed sync attempt (debugging/UI display) */
  lastSyncError?: string | null;
}

/** Payload shape for creating a new record, before system fields attach */
export type NewTriageInput = Pick<
  TriageRecord,
  'patientName' | 'conditionDescription' | 'priority' | 'status'
>;

export interface ValidationResult {
  isValid: boolean;
  errors: Partial<Record<keyof NewTriageInput, string>>;
}

/** Overall sync engine state, surfaced in the UI */
export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Result of a single sync queue processing pass, used for logging/telemetry */
export interface SyncRunResult {
  attempted: number;
  succeeded: number;
  failed: number;
}