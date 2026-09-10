import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  useCreateInterviewRound,
  useDeleteInterviewRound,
  useUpdateInterviewRound,
} from '../hooks/useInterviewMutations';
import { useInterviewRounds } from '../hooks/useInterviewQueries';
import { INTERVIEW_ROUND_OUTCOMES, INTERVIEW_ROUND_TYPES } from '../types';
import type { InterviewRound, InterviewRoundFormData } from '../types';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { PencilIcon, TrashIcon } from '../../applications/components/ApplicationIcons';
import { IconButton } from '../../../components/IconButton';
import { FloatingActionButton } from '../../../components/FloatingActionButton';

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
      return { bg: colors.successSurface, fg: colors.success };
    case 'failed':
      return { bg: colors.dangerSurface, fg: colors.danger };
    case 'cancelled':
      return { bg: colors.warningSurface, fg: colors.warning };
    default:
      return { bg: colors.surfaceAlt, fg: colors.textMuted };
  }
}

interface InterviewRoundFormModalProps {
  visible: boolean;
  isEditing: boolean;
  form: InterviewRoundFormData;
  onChange: (form: InterviewRoundFormData) => void;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

function InterviewRoundFormModal({
  visible,
  isEditing,
  form,
  onChange,
  isSaving,
  onSave,
  onCancel,
}: InterviewRoundFormModalProps) {
  const { t } = useTranslation('interviews');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
      testID="interview-round-form-modal"
    >
      <KeyboardAvoidingView
        style={styles.modalContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalHeader}>
          <Pressable onPress={onCancel} testID="interview-form-cancel-button">
            <Text style={styles.linkMuted}>{t('cancel')}</Text>
          </Pressable>
          <Text style={styles.modalTitle}>{isEditing ? t('edit') : t('addInterviewRound')}</Text>
          <Pressable onPress={onSave} disabled={isSaving} testID="interview-form-save-button">
            <Text style={[styles.link, isSaving && styles.linkDisabled]}>
              {isSaving ? t('saving') : t('save')}
            </Text>
          </Pressable>
        </View>

        <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent}>
          <Text style={styles.fieldLabel}>{t('typeLabel')}</Text>
          <View style={styles.optionRow}>
            {INTERVIEW_ROUND_TYPES.map((type) => (
              <Pressable
                key={type}
                style={[styles.optionChip, form.type === type && styles.optionChipActive]}
                onPress={() => onChange({ ...form, type })}
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
                onPress={() => onChange({ ...form, outcome })}
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

          <Text style={styles.fieldLabel}>{t('interviewerLabel')}</Text>
          <TextInput
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            placeholder={t('interviewerPlaceholder')}
            value={form.interviewerName ?? ''}
            onChangeText={(text) => onChange({ ...form, interviewerName: text || null })}
            testID="interview-interviewer-input"
          />

          <Text style={styles.fieldLabel}>{t('notesLabel')}</Text>
          <TextInput
            placeholderTextColor={colors.textFaint}
            style={[styles.input, styles.multiline]}
            placeholder={t('notesPlaceholder')}
            value={form.notes ?? ''}
            onChangeText={(text) => onChange({ ...form, notes: text || null })}
            multiline
            testID="interview-notes-input"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function InterviewsScreen() {
  const { t } = useTranslation('interviews');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {isLoading ? (
          <ActivityIndicator style={styles.loading} size="large" color={colors.primary} />
        ) : isError ? (
          <Text style={styles.error}>{getErrorMessage(error)}</Text>
        ) : rows.length === 0 ? (
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
                  <IconButton
                    icon={PencilIcon}
                    onPress={() => openEdit(round)}
                    testID={`edit-round-${round.id}`}
                    accessibilityLabel={t('edit')}
                  />
                  <IconButton
                    icon={TrashIcon}
                    variant="danger"
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
                    disabled={deleteRound.isPending}
                    testID={`delete-round-${round.id}`}
                    accessibilityLabel={t('delete')}
                  />
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <FloatingActionButton
        onPress={openCreate}
        testID="add-round-button"
        accessibilityLabel={t('addInterviewRound')}
      />

      <InterviewRoundFormModal
        visible={showForm}
        isEditing={editingId !== null}
        form={form}
        onChange={setForm}
        isSaving={saving}
        onSave={onSave}
        onCancel={onCancel}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1 },
    content: { padding: 16, gap: 12, paddingBottom: 40 },
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
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      backgroundColor: colors.surface,
      color: colors.text,
    },
    multiline: { minHeight: 90, textAlignVertical: 'top' },
    linkMuted: { color: colors.textSubtle, fontSize: 15, fontWeight: '600' },
    link: { color: colors.primary, fontSize: 15, fontWeight: '600' },
    linkDisabled: { color: colors.textFaint },
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
    cardActions: { flexDirection: 'row', gap: 4, marginTop: 4 },
    modalContainer: { flex: 1, backgroundColor: colors.background },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
    modalBody: { flex: 1 },
    modalBodyContent: { padding: 16, gap: 8 },
  });
}
