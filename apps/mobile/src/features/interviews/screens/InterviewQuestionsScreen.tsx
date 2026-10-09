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
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  useCreateInterviewQuestion,
  useDeleteInterviewQuestion,
  useReorderInterviewQuestions,
  useUpdateInterviewQuestion,
} from '../hooks/useInterviewQuestionMutations';
import { useInterviewQuestions } from '../hooks/useInterviewQuestionQueries';
import { useInterviewRounds } from '../hooks/useInterviewQueries';
import { INTERVIEW_QUESTION_LIMITS } from '../types';
import type { InterviewQuestion, InterviewQuestionFormData } from '../types';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PencilIcon,
  TrashIcon,
} from '../../applications/components/ApplicationIcons';
import { IconButton } from '../../../components/IconButton';
import { FloatingActionButton } from '../../../components/FloatingActionButton';

const EMPTY_FORM: InterviewQuestionFormData = { question: '', answer: '' };

interface QuestionFormModalProps {
  visible: boolean;
  isEditing: boolean;
  form: InterviewQuestionFormData;
  onChange: (form: InterviewQuestionFormData) => void;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

function QuestionFormModal({
  visible,
  isEditing,
  form,
  onChange,
  isSaving,
  onSave,
  onCancel,
}: QuestionFormModalProps) {
  const { t } = useTranslation('interviews');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const canSave = !isSaving && form.question.trim().length > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
      testID="question-form-modal"
    >
      <KeyboardAvoidingView
        style={styles.modalContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalHeader}>
          <Pressable onPress={onCancel} testID="question-form-cancel-button">
            <Text style={styles.linkMuted}>{t('cancel')}</Text>
          </Pressable>
          <Text style={styles.modalTitle}>{isEditing ? t('editQuestion') : t('addQuestion')}</Text>
          <Pressable onPress={onSave} disabled={!canSave} testID="question-form-save-button">
            <Text style={[styles.link, !canSave && styles.linkDisabled]}>
              {isSaving ? t('saving') : t('save')}
            </Text>
          </Pressable>
        </View>

        <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent}>
          <Text style={styles.fieldLabel}>{t('questionLabel')}</Text>
          <TextInput
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            placeholder={t('questionPlaceholder')}
            value={form.question}
            onChangeText={(question) => onChange({ ...form, question })}
            maxLength={INTERVIEW_QUESTION_LIMITS.QUESTION_MAX_CHARS}
            autoFocus
            testID="question-input"
          />
          <Text style={styles.counter}>
            {form.question.length} / {INTERVIEW_QUESTION_LIMITS.QUESTION_MAX_CHARS}
          </Text>

          <Text style={styles.fieldLabel}>
            {t('responseLabel')} <Text style={styles.optional}>{t('responseOptional')}</Text>
          </Text>
          <TextInput
            placeholderTextColor={colors.textFaint}
            style={[styles.input, styles.multiline]}
            placeholder={t('responsePlaceholder')}
            value={form.answer}
            onChangeText={(answer) => onChange({ ...form, answer })}
            maxLength={INTERVIEW_QUESTION_LIMITS.ANSWER_MAX_CHARS}
            multiline
            testID="answer-input"
          />
          <Text style={styles.counter}>
            {form.answer.length} / {INTERVIEW_QUESTION_LIMITS.ANSWER_MAX_CHARS}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function InterviewQuestionsScreen() {
  const { t } = useTranslation('interviews');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id: applicationId, roundId } = useLocalSearchParams<{ id: string; roundId: string }>();
  const { data: rounds } = useInterviewRounds(applicationId);
  const { data: questions, isLoading, isError, error } = useInterviewQuestions(roundId);
  const createQuestion = useCreateInterviewQuestion(applicationId, roundId);
  const updateQuestion = useUpdateInterviewQuestion(applicationId, roundId);
  const deleteQuestion = useDeleteInterviewQuestion(applicationId, roundId);
  const reorderQuestions = useReorderInterviewQuestions(applicationId, roundId);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<InterviewQuestionFormData>(EMPTY_FORM);

  const round = rounds?.find((r) => r.id === roundId);
  const rows = questions ?? [];
  const count = round?.questionCount ?? rows.length;
  const atLimit = count >= INTERVIEW_QUESTION_LIMITS.QUESTIONS_PER_ROUND;

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const openCreate = () => {
    if (atLimit) {
      Alert.alert(
        t('questionLimitTitle'),
        t('questionLimitReached', { max: INTERVIEW_QUESTION_LIMITS.QUESTIONS_PER_ROUND }),
      );
      return;
    }
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (question: InterviewQuestion) => {
    setEditingId(question.id);
    setForm({ question: question.question, answer: question.answer ?? '' });
    setShowForm(true);
  };

  const onSave = () => {
    const handlers = {
      onSuccess: closeForm,
      onError: (err: unknown) => Alert.alert(t('couldNotSaveTitle'), getErrorMessage(err)),
    };
    if (editingId) updateQuestion.mutate({ id: editingId, data: form }, handlers);
    else createQuestion.mutate(form, handlers);
  };

  const move = (index: number, offset: -1 | 1) => {
    const ids = rows.map((q) => q.id);
    const target = index + offset;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorderQuestions.mutate(ids, {
      onError: (err) => Alert.alert(t('couldNotSaveTitle'), getErrorMessage(err)),
    });
  };

  const confirmDelete = (question: InterviewQuestion) =>
    Alert.alert(t('deleteQuestionTitle'), t('deleteQuestionMessage'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () =>
          deleteQuestion.mutate(question.id, {
            onError: (err) => Alert.alert(t('couldNotDeleteTitle'), getErrorMessage(err)),
          }),
      },
    ]);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{ title: round ? t('questionsTitle', { type: t(round.type) }) : t('questions') }}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.usage} testID="question-usage">
          {t('questionsUsed', { count, max: INTERVIEW_QUESTION_LIMITS.QUESTIONS_PER_ROUND })}
        </Text>

        {isLoading ? (
          <ActivityIndicator style={styles.loading} size="large" color={colors.primary} />
        ) : isError ? (
          <Text style={styles.error}>{getErrorMessage(error)}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.emptyText}>{t('noQuestionsYet')}</Text>
        ) : (
          rows.map((question, index) => (
            <View key={question.id} style={styles.card} testID={`question-card-${question.id}`}>
              <Text style={styles.question}>{question.question}</Text>
              {question.answer ? (
                <Text style={styles.answer}>{question.answer}</Text>
              ) : (
                <Text style={styles.noAnswer}>{t('noResponseYet')}</Text>
              )}
              <View style={styles.cardActions}>
                <IconButton
                  icon={ChevronUpIcon}
                  onPress={() => move(index, -1)}
                  disabled={index === 0 || reorderQuestions.isPending}
                  testID={`move-question-up-${question.id}`}
                  accessibilityLabel={t('moveQuestionUp')}
                />
                <IconButton
                  icon={ChevronDownIcon}
                  onPress={() => move(index, 1)}
                  disabled={index === rows.length - 1 || reorderQuestions.isPending}
                  testID={`move-question-down-${question.id}`}
                  accessibilityLabel={t('moveQuestionDown')}
                />
                <View style={styles.spacer} />
                <IconButton
                  icon={PencilIcon}
                  onPress={() => openEdit(question)}
                  testID={`edit-question-${question.id}`}
                  accessibilityLabel={t('editQuestion')}
                />
                <IconButton
                  icon={TrashIcon}
                  variant="danger"
                  onPress={() => confirmDelete(question)}
                  disabled={deleteQuestion.isPending}
                  testID={`delete-question-${question.id}`}
                  accessibilityLabel={t('delete')}
                />
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <FloatingActionButton
        onPress={openCreate}
        testID="add-question-button"
        accessibilityLabel={t('addQuestion')}
      />

      <QuestionFormModal
        visible={showForm}
        isEditing={editingId !== null}
        form={form}
        onChange={setForm}
        isSaving={createQuestion.isPending || updateQuestion.isPending}
        onSave={onSave}
        onCancel={closeForm}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1 },
    content: { padding: 16, gap: 12, paddingBottom: 96 },
    usage: { fontSize: 13, color: colors.textSubtle },
    fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textSubtle, marginTop: 4 },
    optional: { fontWeight: '400', color: colors.textFaint },
    counter: { fontSize: 12, color: colors.textFaint, alignSelf: 'flex-end' },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      backgroundColor: colors.surface,
      color: colors.text,
    },
    multiline: { minHeight: 140, textAlignVertical: 'top' },
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
    question: { fontSize: 15, fontWeight: '700', color: colors.text, lineHeight: 21 },
    answer: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
    noAnswer: { fontSize: 14, color: colors.textFaint, fontStyle: 'italic' },
    cardActions: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    spacer: { flex: 1 },
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
