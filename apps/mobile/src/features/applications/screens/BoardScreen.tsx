import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FloatingActionButton } from '../../../components/FloatingActionButton';
import { useApplications } from '../hooks/useApplicationQueries';
import { useMoveApplicationOnBoard } from '../hooks/useApplicationMutations';
import { groupByStatus } from '../lib/boardOrder';
import { StatusBadge, statusLabel } from '../components/StatusBadge';
import { statusDotColor } from '../lib/statusColors';
import { StarIcon } from '../components/ApplicationIcons';
import type { ApplicationDisplayFields } from '../lib/applicationDisplayFields';
import { APPLICATION_STATUSES, type Application, type ApplicationStatus } from '../types';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

const STAR_COLOR = '#eab308';

const COLUMN_WIDTH = 220;

interface Props {
  displayFields: ApplicationDisplayFields;
}

export function BoardScreen({ displayFields }: Props) {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { data: applications, isLoading, isError, error } = useApplications();
  const moveOnBoard = useMoveApplicationOnBoard();

  const [movingApp, setMovingApp] = useState<Application | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  const apps = useMemo(() => applications ?? [], [applications]);
  const appsById = useMemo(() => new Map(apps.map((a) => [a.id, a])), [apps]);
  const columns = useMemo(() => groupByStatus(apps, APPLICATION_STATUSES), [apps]);

  const onMoveTo = async (toStatus: ApplicationStatus) => {
    if (!movingApp) return;
    setMoveError(null);
    const targetIds = columns[toStatus] ?? [];
    try {
      await moveOnBoard.mutateAsync({
        applicationId: movingApp.id,
        toStatus,
        orderedIds: [...targetIds, movingApp.id],
      });
      setMovingApp(null);
    } catch (err) {
      setMoveError(getErrorMessage(err));
    }
  };

  if (isLoading) {
    return <ActivityIndicator style={styles.loading} size="large" color={colors.primary} />;
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{getErrorMessage(error)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.board}>
        {APPLICATION_STATUSES.map((status) => (
          <View key={status} style={styles.column} testID={`board-column-${status}`}>
            <View style={styles.columnHeader}>
              <View style={styles.columnTitleRow}>
                <View
                  style={[styles.columnDot, { backgroundColor: statusDotColor(status, colors) }]}
                  testID={`column-dot-${status}`}
                />
                <Text
                  style={[styles.columnTitle, { color: statusDotColor(status, colors) }]}
                  numberOfLines={1}
                  testID={`column-title-${status}`}
                >
                  {statusLabel(status)}
                </Text>
              </View>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{columns[status]?.length ?? 0}</Text>
              </View>
            </View>
            <ScrollView style={styles.columnList}>
              {(columns[status] ?? []).map((id) => {
                const app = appsById.get(id);
                if (!app) return null;
                const showMetaRow =
                  (displayFields.starred && app.starred) ||
                  displayFields.date ||
                  displayFields.status ||
                  (displayFields.ghosted && app.likelyGhosted);
                return (
                  <Pressable
                    key={id}
                    style={styles.card}
                    onPress={() => router.push(`/applications/${id}`)}
                    onLongPress={() => setMovingApp(app)}
                    testID={`board-card-${id}`}
                  >
                    <Text style={styles.cardCompany} numberOfLines={2}>
                      {app.company}
                    </Text>
                    {displayFields.role ? (
                      <Text style={styles.cardRole} numberOfLines={1}>
                        {app.role}
                      </Text>
                    ) : null}
                    {displayFields.location && app.location ? (
                      <Text style={styles.cardLocation} numberOfLines={1}>
                        {app.location}
                      </Text>
                    ) : null}
                    {displayFields.tags && app.tags.length > 0 ? (
                      <View style={styles.cardTagsRow}>
                        {app.tags.slice(0, 2).map((tag) => (
                          <Text key={tag} style={styles.cardTag} numberOfLines={1}>
                            {tag}
                          </Text>
                        ))}
                        {app.tags.length > 2 ? (
                          <Text style={styles.cardTagsMore}>+{app.tags.length - 2}</Text>
                        ) : null}
                      </View>
                    ) : null}
                    {showMetaRow ? (
                      <View style={styles.cardMetaRow}>
                        <View style={styles.cardMetaLeading}>
                          {displayFields.starred && app.starred ? (
                            <StarIcon color={STAR_COLOR} size={11} filled />
                          ) : null}
                          {displayFields.date ? (
                            <Text style={styles.cardDate} numberOfLines={1}>
                              {new Date(app.appliedAt ?? app.createdAt).toLocaleDateString()}
                            </Text>
                          ) : null}
                        </View>
                        <View style={styles.cardMetaTrailing}>
                          {displayFields.status ? <StatusBadge status={app.status} /> : null}
                          {displayFields.ghosted && app.likelyGhosted ? (
                            <Text style={styles.cardGhostedBadge}>{t('list.likelyGhosted')}</Text>
                          ) : null}
                        </View>
                      </View>
                    ) : null}
                    <Pressable
                      style={styles.moveButton}
                      onPress={() => setMovingApp(app)}
                      testID={`move-card-${id}`}
                    >
                      <Text style={styles.moveButtonText}>{t('board.move')}</Text>
                    </Pressable>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ))}
      </ScrollView>

      <FloatingActionButton
        onPress={() => router.push('/applications/new')}
        testID="board-new-application-button"
      />

      <Modal
        visible={movingApp != null}
        transparent
        animationType="fade"
        onRequestClose={() => setMovingApp(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {t('board.moveModalTitle', { company: movingApp?.company })}
            </Text>
            {moveError ? <Text style={styles.error}>{moveError}</Text> : null}
            {APPLICATION_STATUSES.filter((s) => s !== movingApp?.status).map((status) => (
              <Pressable
                key={status}
                style={styles.modalOption}
                onPress={() => onMoveTo(status)}
                disabled={moveOnBoard.isPending}
                testID={`move-to-${status}`}
              >
                <Text style={styles.modalOptionText}>{statusLabel(status)}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setMovingApp(null)} testID="cancel-move-button">
              <Text style={styles.modalCancel}>{t('board.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loading: { marginTop: 40 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 13,
    },
    board: { flex: 1, paddingHorizontal: 12, marginTop: 16 },
    column: {
      width: COLUMN_WIDTH,
      marginHorizontal: 4,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 12,
      padding: 8,
    },
    columnHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 4,
      paddingBottom: 8,
    },
    columnTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
    columnDot: { width: 8, height: 8, borderRadius: 9999, flexShrink: 0 },
    columnTitle: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
    countBadge: {
      backgroundColor: colors.border,
      borderRadius: 9999,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    countText: { fontSize: 11, color: colors.textSubtle },
    columnList: { gap: 8 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 10,
      marginBottom: 8,
    },
    cardCompany: { fontSize: 13, fontWeight: '600', color: colors.text },
    cardRole: { fontSize: 12, color: colors.textSubtle, marginTop: 2 },
    cardLocation: { fontSize: 11, color: colors.textFaint, marginTop: 2 },
    cardTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
    cardTag: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.primary,
      backgroundColor: colors.primarySurface,
      borderRadius: 4,
      paddingHorizontal: 5,
      paddingVertical: 2,
      maxWidth: COLUMN_WIDTH - 40,
    },
    cardTagsMore: { fontSize: 10, color: colors.textFaint, alignSelf: 'center' },
    cardMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 4,
      marginTop: 8,
    },
    cardMetaLeading: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
    cardMetaTrailing: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
    cardDate: { fontSize: 11, color: colors.textFaint },
    cardGhostedBadge: { fontSize: 10, fontWeight: '600', color: colors.warning },
    moveButton: { alignSelf: 'flex-end', marginTop: 6 },
    moveButtonText: { fontSize: 11, color: colors.primary, fontWeight: '600' },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    modalCard: {
      width: '100%',
      maxWidth: 320,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      gap: 4,
    },
    modalTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 8 },
    modalOption: { paddingVertical: 10 },
    modalOptionText: { fontSize: 14, color: colors.text },
    modalCancel: { fontSize: 14, color: colors.textSubtle, fontWeight: '600', marginTop: 8 },
  });
}
