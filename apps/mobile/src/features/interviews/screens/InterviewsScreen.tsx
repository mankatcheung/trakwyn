import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  useCreateInterviewRound,
  useDeleteInterviewRound,
  useUpdateInterviewRound,
} from '../hooks/useInterviewMutations';
import { useInterviewRounds } from '../hooks/useInterviewQueries';
import { INTERVIEW_ROUND_OUTCOMES, INTERVIEW_ROUND_TYPES } from '../types';
import type { InterviewRound, InterviewRoundFormData } from '../types';
import { SectionTabBar } from '../../applications/components/SectionTabBar';
import {
  DETAIL_SECTION_ROUTES,
  type DetailSectionKey,
} from '../../applications/lib/detailSections';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

function emptyForm(): InterviewRoundFormData {
  return {
    type: 'phone',
    scheduledAt: null,
    interviewerName: null,
    notes: null,
    outcome: 'pending',
  };
}

function outcomeStyle(colors: ThemeColors, outcome: string) {
  switch (outcome) {
    case 'passed':
      return { bg: '#dcfce7', fg: '#15803d' };
    case 'failed':
      return { bg: colors.dangerSurface, fg: colors.danger };
    case 'cancelled':
      return { bg: '#fef3c7', fg: '#a16207' };
    default:
      return { bg: colors.surfaceAlt, fg: colors.textMuted };
  }
}

export function InterviewsScreen() {
  const { t } = useTranslation('interviews');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { id: applicationId } = useLocalSearchParams<{ id: string }>();
  const { data: rounds, isLoading, isError, error } = useInterviewRounds(applicationId);
  const createRound = useCreateInterviewRound(applicationId);
  const updateRound = useUpdateInterviewRound(applicationId);
  const deleteRound = useDeleteInterviewRound(applicationId);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<InterviewRoundFormData>(emptyForm());

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (round: InterviewRound) => {
    setEditingId(round.id);
    setForm({
      type: round.type,
      scheduledAt: round.scheduledAt,
      interviewerName: round.interviewerName,
      notes: round.notes,
      outcome: round.outcome,
    });
    setShowForm(true);
  };

  const onCancel = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const onSave = () => {
    if (editingId) {
      updateRound.mutate(
        { id: editingId, data: form },
        {
          onSuccess: onCancel,
          onError: (err) => Alert.alert(t('couldNotSaveTitle'), getErrorMessage(err)),
        },
      );
    } else {
      createRound.mutate(form, {
        onSuccess: onCancel,
        onError: (err) => Alert.alert(t('couldNotSaveTitle'), getErrorMessage(err)),
      });
    }
  };

  const rows = rounds ?? [];
  const saving = createRound.isPending || updateRound.isPending;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.tabsWrapper}>
        <SectionTabBar
          items={[
            { key: 'notes', label: t('notesTabLabel') },
            { key: 'interviews', label: t('interviewsTabLabel') },
            { key: 'documents', label: t('documentsTabLabel') },
          ]}
          activeKey="interviews"
          onSelect={(key) => {
            if (key === 'interviews') return;
            router.push(DETAIL_SECTION_ROUTES[key as DetailSectionKey] as never);
          }}
        />
      </View>

      {!showForm && (
        <View style={styles.actionsRow}>
          <Pressable style={styles.addButton} onPress={openCreate} testID="add-round-button">
            <Text style={styles.addButtonText}>{t('addInterviewRound')}</Text>
          </Pressable>
        </View>
      )}

      {showForm && (
        <View style={styles.formCard} testID="interview-round-form">
          <Text style={styles.fieldLabel}>{t('typeLabel')}</Text>
          <View style={styles.optionRow}>
            {INTERVIEW_ROUND_TYPES.map((type) => (
              <Pressable
                key={type}
                style={[styles.optionChip, form.type === type && styles.optionChipActive]}
                onPress={() => setForm({ ...form, type })}
                testID={`interview-type-${type}`}
              >
                <Text
                  style={[styles.optionChipText, form.type === type && styles.optionChipTextActive]}
                >
                  {t(type)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>{t('outcomeLabel')}</Text>
          <View style={styles.optionRow}>
            {INTERVIEW_ROUND_OUTCOMES.map((outcome) => (
              <Pressable
                key={outcome}
                style={[styles.optionChip, form.outcome === outcome && styles.optionChipActive]}
                onPress={() => setForm({ ...form, outcome })}
                testID={`interview-outcome-${outcome}`}
              >
                <Text
                  style={[
                    styles.optionChipText,
                    form.outcome === outcome && styles.optionChipTextActive,
                  ]}
                >
                  {t(outcome)}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.formActions}>
            <Pressable
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={onSave}
              disabled={saving}
              testID="interview-form-save-button"
            >
              <Text style={styles.saveButtonText}>{saving ? t('saving') : t('save')}</Text>
            </Pressable>
            <Pressable onPress={onCancel} testID="interview-form-cancel-button">
              <Text style={styles.linkMuted}>{t('cancel')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator style={styles.loading} size="large" color={colors.primary} />
      ) : isError ? (
        <Text style={styles.error}>{getErrorMessage(error)}</Text>
      ) : rows.length === 0 && !showForm ? (
        <Text style={styles.emptyText}>{t('noInterviewRoundsYet')}</Text>
      ) : (
        rows.map((round) => {
          const tone = outcomeStyle(colors, round.outcome);
          return (
            <View key={round.id} style={styles.card} testID={`interview-round-${round.id}`}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.roundType}>{t(round.type)}</Text>
                <View style={[styles.outcomeBadge, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.outcomeText, { color: tone.fg }]}>{t(round.outcome)}</Text>
                </View>
              </View>
              {round.interviewerName ? (
                <Text style={styles.meta}>
                  {t('withInterviewer', { name: round.interviewerName })}
                </Text>
              ) : null}
              {round.scheduledAt ? (
                <Text style={styles.meta}>{new Date(round.scheduledAt).toLocaleString()}</Text>
              ) : null}
              {round.notes ? <Text style={styles.notes}>{round.notes}</Text> : null}
              <View style={styles.cardActions}>
                <Pressable onPress={() => openEdit(round)} testID={`edit-round-${round.id}`}>
                  <Text style={styles.link}>{t('edit')}</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    Alert.alert(t('deleteRoundTitle'), t('deleteRoundMessage'), [
                      { text: t('cancel'), style: 'cancel' },
                      {
                        text: t('delete'),
                        style: 'destructive',
                        onPress: () =>
                          deleteRound.mutate(round.id, {
                            onError: (err) =>
                              Alert.alert(t('couldNotDeleteTitle'), getErrorMessage(err)),
                          }),
                      },
                    ])
                  }
                  testID={`delete-round-${round.id}`}
                >
                  <Text style={styles.linkDanger}>{t('delete')}</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 12, paddingBottom: 40 },
    tabsWrapper: { marginBottom: 4 },
    actionsRow: { flexDirection: 'row', gap: 10 },
    addButton: {
      minHeight: 44,
      paddingHorizontal: 18,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addButtonText: { color: colors.onPrimary, fontSize: 14, fontWeight: '700' },
    formCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 8,
    },
    fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textSubtle, marginTop: 4 },
    optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    optionChip: {
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.surface,
    },
    optionChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    optionChipText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
    optionChipTextActive: { color: colors.onPrimary },
    formActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
    saveButton: {
      minHeight: 40,
      paddingHorizontal: 18,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveButtonDisabled: { opacity: 0.6 },
    saveButtonText: { color: colors.onPrimary, fontSize: 14, fontWeight: '700' },
    linkMuted: { color: colors.textSubtle, fontSize: 13, fontWeight: '600' },
    loading: { marginTop: 24 },
    emptyText: { fontSize: 13, color: colors.textFaint, textAlign: 'center', paddingVertical: 24 },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 13,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 6,
    },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    roundType: { fontSize: 15, fontWeight: '700', color: colors.text, textTransform: 'capitalize' },
    outcomeBadge: { borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 3 },
    outcomeText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
    meta: { fontSize: 13, color: colors.textSubtle },
    notes: { fontSize: 14, color: colors.textMuted, marginTop: 2, lineHeight: 20 },
    cardActions: { flexDirection: 'row', gap: 16, marginTop: 4 },
    link: { color: colors.primary, fontSize: 13, fontWeight: '600' },
    linkDanger: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  });
}
