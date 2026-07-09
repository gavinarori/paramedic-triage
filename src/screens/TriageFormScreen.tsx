import React, { useEffect, useState, useCallback } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { TriageForm } from '../components/TriageForm';
import { COLORS, getPriorityColors } from '../utils/colors';
import { AppDispatch } from '../store';
import {
  loadTriages,
  submitTriage,
  selectAllTriages,
  selectPendingTriages,
  recordSyncOutcome,
} from '../features/triageSlice';
import {
  setOnlineStatus,
  syncStarted,
  syncFinished,
  selectIsOnline,
  selectSyncStatus,
} from '../features/syncSlice';
import { syncService } from '../services/syncService';
import { NewTriageInput, TriageRecord } from '../types';

/**
 * Single-screen triage intake, per the assessment spec. Responsibilities
 * here are orchestration only: dispatch thunks, subscribe to the sync
 * engine, and render state. No storage/network code lives in this file.
 */
export default function TriageFormScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const allRecords = useSelector(selectAllTriages);
  const pendingRecords = useSelector(selectPendingTriages);
  const isOnline = useSelector(selectIsOnline);
  const syncStatus = useSelector(selectSyncStatus);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Load persisted records and start the sync engine once, on mount.
  useEffect(() => {
    dispatch(loadTriages());
    syncService.start();

    // Bridge sync engine events -> Redux, so the UI reacts to connectivity
    // and sync progress without polling.
    const unsubscribe = syncService.subscribe((status) => {
      dispatch(setOnlineStatus(status.isOnline));

      if (status.isSyncing) {
        dispatch(syncStarted());
      } else if (status.lastResult) {
        dispatch(syncFinished(status.lastResult));
        // Pull the freshest synced/unsynced flags from storage into Redux
        // so pending counts and badges update immediately after a run.
        dispatch(loadTriages());
      }
    });

    return () => {
      unsubscribe();
      // Intentionally NOT calling syncService.stop() here: the engine should
      // keep listening for connectivity while the app is alive, even if
      // this screen unmounts (single-screen app, but this pattern is
      // correct practice for multi-screen apps too).
    };
  }, [dispatch]);

  const handleSubmit = useCallback(
    async (input: NewTriageInput) => {
      setIsSubmitting(true);
      try {
        // This resolves as soon as the LOCAL save completes — the network
        // sync (if any) happens independently in the background. This is
        // the "optimistic local save" required by the spec: the paramedic
        // sees success instantly regardless of connectivity.
        await dispatch(submitTriage(input)).unwrap();
      } catch (err) {
        // In production, surface a toast/snackbar here. Local save failures
        // are rare (disk full, etc.) but should never be silently swallowed.
        console.error('Failed to save triage record locally:', err);
      } finally {
        setIsSubmitting(false);
      }
    },
    [dispatch],
  );

  const handleManualRefresh = useCallback(async () => {
    setRefreshing(true);
    await dispatch(loadTriages());
    await syncService.triggerSync();
    setRefreshing(false);
  }, [dispatch]);

  const renderRecord = ({ item }: { item: TriageRecord }) => {
    const colors = getPriorityColors(item.priority);
    return (
      <View style={[styles.recordCard, { borderLeftColor: colors.background }]}>
        <View style={styles.recordHeader}>
          <Text style={styles.recordName}>{item.patientName}</Text>
          <View style={[styles.priorityChip, { backgroundColor: colors.background }]}>
            <Text style={[styles.priorityChipText, { color: colors.text }]}>
              P{item.priority} · {colors.label}
            </Text>
          </View>
        </View>
        <Text style={styles.recordDescription} numberOfLines={2}>
          {item.conditionDescription}
        </Text>
        <View style={styles.recordFooter}>
          <Text style={styles.recordMeta}>{item.status}</Text>
          <View style={styles.syncBadge}>
            <View
              style={[
                styles.syncDot,
                { backgroundColor: item.synced ? COLORS.syncedBadge : COLORS.pendingBadge },
              ]}
            />
            <Text style={styles.syncBadgeText}>
              {item.synced ? 'Synced' : `Pending${item.syncAttempts > 0 ? ` (retry ${item.syncAttempts})` : ''}`}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.statusBar}>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: isOnline ? COLORS.success : COLORS.error }]} />
          <Text style={styles.statusText}>{isOnline ? 'Online' : 'Offline — records queued locally'}</Text>
        </View>
        {syncStatus === 'syncing' ? (
          <Text style={styles.syncingText}>Syncing…</Text>
        ) : pendingRecords.length > 0 ? (
          <Text style={styles.pendingText}>{pendingRecords.length} pending upload</Text>
        ) : (
          <Text style={styles.pendingText}>All records synced</Text>
        )}
      </View>

      <FlatList
        data={allRecords}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            <TriageForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
            {allRecords.length > 0 && <Text style={styles.sectionTitle}>Recent Records</Text>}
          </>
        }
        renderItem={renderRecord}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleManualRefresh} />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No triage records yet. Submit one above.</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  syncingText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  pendingText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  listContent: {
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 10,
  },
  recordCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderLeftWidth: 5,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    elevation: 1,
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  recordName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  priorityChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  priorityChipText: {
    fontSize: 11,
    fontWeight: '800',
  },
  recordDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  recordFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recordMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  syncBadgeText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    marginTop: 40,
    fontSize: 14,
  },
});