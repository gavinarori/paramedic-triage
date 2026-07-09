import { TriageRecord, ApiResponse } from '../types';

/**
 * Mock backend for POST /api/v1/triage.
 *
 * Per the assessment spec, no live backend is required. This module
 * simulates real-world network conditions so the sync engine can be proven
 * out end-to-end:
 *   - A fixed ~2 second latency, representative of a slow field connection.
 *   - A configurable random failure rate, to exercise retry/backoff logic.
 *
 * Nothing outside this file knows it's fake — swapping this for a real
 * `fetch('https://api.example.com/api/v1/triage', ...)` call is a
 * drop-in replacement with an identical signature.
 */

const SIMULATED_LATENCY_MS = 2000;
const FAILURE_RATE = 0.3; // 30% of requests simulate a network/server failure

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldSimulateFailure(): boolean {
  return Math.random() < FAILURE_RATE;
}

/**
 * Simulates submitting a single triage record to the server.
 * Mirrors the shape a real POST /api/v1/triage endpoint would return.
 */
export async function postTriageRecord(
  record: TriageRecord,
): Promise<ApiResponse<{ id: string; serverReceivedAt: string }>> {
  await delay(SIMULATED_LATENCY_MS);

  if (shouldSimulateFailure()) {
    const errorMessages = [
      'Network request timed out.',
      'Server returned 503 Service Unavailable.',
      'Connection reset during upload.',
    ];
    const message = errorMessages[Math.floor(Math.random() * errorMessages.length)];
    return { success: false, error: message };
  }

  return {
    success: true,
    data: {
      id: record.id,
      serverReceivedAt: new Date().toISOString(),
    },
  };
}

/**
 * Simulates a batch upload endpoint. Not strictly required by the spec,
 * but included so the sync engine has the option of batching instead of
 * streaming one-by-one for larger queues (see syncService.ts).
 */
export async function postTriageBatch(
  records: TriageRecord[],
): Promise<ApiResponse<{ acceptedIds: string[]; rejectedIds: string[] }>> {
  await delay(SIMULATED_LATENCY_MS);

  const acceptedIds: string[] = [];
  const rejectedIds: string[] = [];

  for (const record of records) {
    if (shouldSimulateFailure()) {
      rejectedIds.push(record.id);
    } else {
      acceptedIds.push(record.id);
    }
  }

  return {
    success: rejectedIds.length === 0,
    data: { acceptedIds, rejectedIds },
  };
}