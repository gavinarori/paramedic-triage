import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  saveTriage,
  getAllTriages,
  updateSyncStatus,
  getPendingTriages,
  deleteTriage,
  clearAllTriages,
} from '../services/storage';
import { validateTriageInput } from '../utils/validation';
import { TriageRecord } from '../types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

function buildRecord(overrides: Partial<TriageRecord> = {}): TriageRecord {
  return {
    id: overrides.id ?? 'test-id-1',
    patientName: 'Jane Doe',
    conditionDescription: 'Severe chest pain',
    priority: 1,
    status: 'Pending',
    timestamp: new Date().toISOString(),
    synced: false,
    syncAttempts: 0,
    lastSyncError: null,
    ...overrides,
  };
}

describe('validation', () => {
  it('rejects a submission with no patient name', () => {
    const result = validateTriageInput({
      patientName: '',
      conditionDescription: 'Broken arm',
      priority: 3,
      status: 'Pending',
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.patientName).toBeDefined();
  });

  it('rejects a submission with no priority selected', () => {
    const result = validateTriageInput({
      patientName: 'John Doe',
      conditionDescription: 'Broken arm',
      status: 'Pending',
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.priority).toBeDefined();
  });

  it('accepts a fully valid submission', () => {
    const result = validateTriageInput({
      patientName: 'John Doe',
      conditionDescription: 'Broken arm, stable',
      priority: 4,
      status: 'Pending',
    });
    expect(result.isValid).toBe(true);
    expect(Object.keys(result.errors).length).toBe(0);
  });

  it('rejects an out-of-range priority', () => {
    const result = validateTriageInput({
      patientName: 'John Doe',
      conditionDescription: 'Broken arm',
      // @ts-expect-error intentionally invalid for the test
      priority: 9,
      status: 'Pending',
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.priority).toBeDefined();
  });
});

describe('storage service (offline persistence)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('saves a record and retrieves it', async () => {
    const record = buildRecord();
    await saveTriage(record);

    const all = await getAllTriages();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(record.id);
    expect(all[0].synced).toBe(false);
  });

  it('returns an empty array when nothing has been saved', async () => {
    const all = await getAllTriages();
    expect(all).toEqual([]);
  });

  it('marks a record as synced and clears it from the pending queue', async () => {
    const record = buildRecord({ id: 'rec-1' });
    await saveTriage(record);

    let pending = await getPendingTriages();
    expect(pending).toHaveLength(1);

    await updateSyncStatus('rec-1', true);

    pending = await getPendingTriages();
    expect(pending).toHaveLength(0);

    const all = await getAllTriages();
    expect(all[0].synced).toBe(true);
  });

  it('increments retry count and stores the error on failed sync', async () => {
    const record = buildRecord({ id: 'rec-2' });
    await saveTriage(record);

    await updateSyncStatus('rec-2', false, 'Server returned 503');

    const all = await getAllTriages();
    expect(all[0].synced).toBe(false);
    expect(all[0].syncAttempts).toBe(1);
    expect(all[0].lastSyncError).toBe('Server returned 503');
  });

  it('keeps multiple pending records queued independently', async () => {
    await saveTriage(buildRecord({ id: 'a' }));
    await saveTriage(buildRecord({ id: 'b' }));
    await saveTriage(buildRecord({ id: 'c' }));

    await updateSyncStatus('b', true);

    const pending = await getPendingTriages();
    expect(pending.map((r) => r.id).sort()).toEqual(['a', 'c']);
  });

  it('deletes a record', async () => {
    await saveTriage(buildRecord({ id: 'to-delete' }));
    await deleteTriage('to-delete');

    const all = await getAllTriages();
    expect(all).toHaveLength(0);
  });

  it('clears all records', async () => {
    await saveTriage(buildRecord({ id: 'x' }));
    await saveTriage(buildRecord({ id: 'y' }));
    await clearAllTriages();

    const all = await getAllTriages();
    expect(all).toEqual([]);
  });
});