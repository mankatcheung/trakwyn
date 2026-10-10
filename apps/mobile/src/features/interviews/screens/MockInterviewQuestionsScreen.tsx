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
  useCreateMockInterviewQuestion,
  useDeleteMockInterviewQuestion,
  useGenerateMockInterviewAnswer,
  useReorderMockInterviewQuestions,
  useUpdateMockInterviewQuestion,
} from '../hooks/useMockInterviewQuestionMutations';
import { useMockInterviewQuestions } from '../hooks/useMockInterviewQuestionQueries';
import { useInterviewRounds } from '../hooks/useInterviewQueries';
import { INTERVIEW_QUESTION_LIMITS, MOCK_QUESTION_LIMITS } from '../types';
import type { InterviewQuestionFormData, MockInterviewQuestion } from '../types';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PencilIcon,
  SparklesIcon,
  TrashIcon,
} from '../../applications/components/ApplicationIcons';
import { IconButton } from '../../../components/IconButton';
import { FloatingActionButton } from '../../../components/FloatingActionButton';
import { AiGeneratedBadge } from '../components/AiGeneratedBadge';
import { AnswerDraftModal } from '../components/AnswerDraftModal';
import { GenerateQuestionsModal } from '../components/GenerateQuestionsModal';

const EMPTY_FORM: InterviewQuestionFormData = { question: '', answer: '' };

interface FormModalProps {
  visible: boolean;
  isEditing: boolean;
  form: InterviewQuestionFormData;
  onChange: (form: InterviewQuestionFormData) => void;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

function PracticeFormModal({
  visible,
  isEditing,
  form,
  onChange,
  isSaving,
  onSave,
  onCancel,
}: FormModalProps) {
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
      testID="practice-form-modal"
    >
      <KeyboardAvoidingView
        style={styles.modalContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalHeader}>
          <Pressable onPress={onCancel} testID="practice-form-cancel-button">
            <Text style={styles.linkMuted}>{t('cancel')}</Text>
          </Pressable>
          <Text style={styles.modalTitle}>
            {isEditing ? t('editQuestion') : t('addPracticeQuestion')}
          </Text>
          <Pressable onPress={onSave} disabled={!canSave} testID="practice-form-save-button">
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
            placeholder={t('practiceQuestionPlaceholder')}
            value={form.question}
            onChangeText={(question) => onChange({ ...form, question })}
            maxLength={INTERVIEW_QUESTION_LIMITS.QUESTION_MAX_CHARS}
            autoFocus
            testID="practice-question-input"
          />
          <Text style={styles.counter}>
            {form.question.length} / {INTERVIEW_QUESTION_LIMITS.QUESTION_MAX_CHARS}
          </Text>

          <Text style={styles.fieldLabel}>
            {t('practiceAnswerLabel')} <Text style={styles.optional}>{t('responseOptional')}</Text>
          </Text>
          <TextInput
            placeholderTextColor={colors.textFaint}
            style={[styles.input, styles.multiline]}
            placeholder={t('practiceAnswerPlaceholder')}
            value={form.answer}
            onChangeText={(answer) => onChange({ ...form, answer })}
            maxLength={INTERVIEW_QUESTION_LIMITS.ANSWER_MAX_CHARS}
            multiline
            testID="practice-answer-input"
          />
          <Text style={styles.counter}>
            {form.answer.length} / {INTERVIEW_QUESTION_LIMITS.ANSWER_MAX_CHARS}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Practice questions for one interview round: mock questions to prepare with,
 * kept apart from the questions actually asked. The user can write their own,
 * ask the AI for more, and write or AI-draft an answer to each.
 */
export function MockInterviewQuestionsScreen() {
  const { t } = useTranslation('interviews');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id: applicationId, roundId } = useLocalSearchParams<{ id: string; roundId: string }>();
  const { data: rounds } = useInterviewRounds(applicationId);
  const { data: questions, isLoading, isError, error } = useMockInterviewQuestions(roundId);
  const createQuestion = useCreateMockInterviewQuestion(applicationId, roundId);
  const updateQuestion = useUpdateMockInterviewQuestion(applicationId, roundId);
  const deleteQuestion = useDeleteMockInterviewQuestion(applicationId, roundId);
  const reorderQuestions = useReorderMockInterviewQuestions(applicationId, roundId);
  const generateAnswer = useGenerateMockInterviewAnswer();

  const [showForm, setShowForm] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<InterviewQuestionFormData>(EMPTY_FORM);
  const [draft, setDraft] = useState<{
    question: MockInterviewQuestion;
    text: string;
    version: number;
  } | null>(null);

  const round = rounds?.find((r) => r.id === roundId);
  const rows = questions ?? [];
  const count = round?.mockQuestionCount ?? rows.length;
  const slotsLeft = Math.max(0, MOCK_QUESTION_LIMITS.QUESTIONS_PER_ROUND - count);
  const atLimit = slotsLeft === 0;

  const alertLimit = () =>
    Alert.alert(
      t('practiceLimitTitle'),
      t('practiceLimitReached', { max: MOCK_QUESTION_LIMITS.QUESTIONS_PER_ROUND }),
    );

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const openCreate = () => {
    if (atLimit) return alertLimit();
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openGenerate = () => {
    if (atLimit) return alertLimit();
    setShowGenerate(true);
  };

  const openEdit = (question: MockInterviewQuestion) => {
    setEditingId(question.id);
    setForm({ question: question.question, answer: question.answer ?? '' });
    setShowForm(true);
  };

  const onSave = () => {
    const handlers = {
      onSuccess: closeForm,
      onError: (err: unknown) => Alert.alert(t('couldNotSaveTitle'), getErrorMessage(err)),
    };
    // Editing sends no answer source, so an AI answer keeps its label.
    if (editingId) updateQuestion.mutate({ id: editingId, data: form }, handlers);
    else createQuestion.mutate(form, handlers);
  };

  const startDraft = (question: MockInterviewQuestion) =>
    generateAnswer.mutate(question.id, {
      onSuccess: (result) => setDraft({ question, text: result.answer, version: 0 }),
      onError: (err) => Alert.alert(t('couldNotGenerateTitle'), getErrorMessage(err)),
    });

  const regenerateDraft = () => {
    if (!draft) return;
    generateAnswer.mutate(draft.question.id, {
      onSuccess: (result) =>
        setDraft({ question: draft.question, text: result.answer, version: draft.version + 1 }),
      onError: (err) => Alert.alert(t('couldNotGenerateTitle'), getErrorMessage(err)),
    });
  };

  const saveDraft = (answer: string) => {
    if (!draft) return;
    updateQuestion.mutate(
      {
        id: draft.question.id,
        data: { question: draft.question.question, answer },
        answerSource: 'ai',
      },
      {
        onSuccess: () => setDraft(null),
        onError: (err) => Alert.alert(t('couldNotSaveTitle'), getErrorMessage(err)),
      },
    );
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

  const confirmDelete = (question: MockInterviewQuestion) =>
    Alert.alert(t('deletePracticeTitle'), t('deleteQuestionMessage'), [
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
        options={{ title: round ? t('practiceTitle', { type: t(round.type) }) : t('practice') }}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.hint}>{t('practiceHint')}</Text>
        <Text style={styles.usage} testID="practice-usage">
          {t('questionsUsed', { count, max: MOCK_QUESTION_LIMITS.QUESTIONS_PER_ROUND })}
        </Text>

        <Pressable
          style={styles.generateRow}
          onPress={openGenerate}
          accessibilityRole="button"
          testID="generate-questions-button"
        >
          <SparklesIcon color={colors.primary} size={18} />
          <Text style={styles.generateRowText}>{t('generateQuestions')}</Text>
        </Pressable>

        {isLoading ? (
          <ActivityIndicator style={styles.loading} size="large" color={colors.primary} />
        ) : isError ? (
          <Text style={styles.error}>{getErrorMessage(error)}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.emptyText}>{t('noPracticeYet')}</Text>
        ) : (
          rows.map((question, index) => (
            <View key={question.id} style={styles.card} testID={`practice-card-${question.id}`}>
              <Text style={styles.question}>{question.question}</Text>
              {question.answer ? (
                <>
                  <Text style={styles.answer}>{question.answer}</Text>
                  {question.answerSource === 'ai' ? (
                    <AiGeneratedBadge testID={`ai-badge-${question.id}`} />
                  ) : null}
                </>
              ) : (
                <View style={styles.noAnswerBlock}>
                  <Text style={styles.noAnswer}>{t('noAnswerYet')}</Text>
                  <View style={styles.answerActions}>
                    <Pressable
                      style={styles.answerButton}
                      onPress={() => openEdit(question)}
                      accessibilityRole="button"
                      testID={`write-answer-${question.id}`}
                    >
                      <Text style={styles.answerButtonText}>{t('writeAnswer')}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.answerButton, styles.answerButtonAi]}
                      onPress={() => startDraft(question)}
                      disabled={generateAnswer.isPending}
                      accessibilityRole="button"
                      testID={`generate-answer-${question.id}`}
                    >
                      <Text style={[styles.answerButtonText, styles.answerButtonAiText]}>
                        {generateAnswer.isPending && generateAnswer.variables === question.id
                          ? t('generating')
                          : t('generateAnswer')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}
              <View style={styles.cardActions}>
                <IconButton
                  icon={ChevronUpIcon}
                  onPress={() => move(index, -1)}
                  disabled={index === 0 || reorderQuestions.isPending}
                  testID={`move-practice-up-${question.id}`}
                  accessibilityLabel={t('moveQuestionUp')}
                />
                <IconButton
                  icon={ChevronDownIcon}
                  onPress={() => move(index, 1)}
                  disabled={index === rows.length - 1 || reorderQuestions.isPending}
                  testID={`move-practice-down-${question.id}`}
                  accessibilityLabel={t('moveQuestionDown')}
                />
                <View style={styles.spacer} />
                <IconButton
                  icon={PencilIcon}
                  onPress={() => openEdit(question)}
                  testID={`edit-practice-${question.id}`}
                  accessibilityLabel={t('editQuestion')}
                />
                <IconButton
                  icon={TrashIcon}
                  variant="danger"
                  onPress={() => confirmDelete(question)}
                  disabled={deleteQuestion.isPending}
                  testID={`delete-practice-${question.id}`}
                  accessibilityLabel={t('delete')}
                />
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <FloatingActionButton
        onPress={openCreate}
        testID="add-practice-button"
        accessibilityLabel={t('addPracticeQuestion')}
      />

      <PracticeFormModal
        visible={showForm}
        isEditing={editingId !== null}
        form={form}
        onChange={setForm}
        isSaving={createQuestion.isPending || updateQuestion.isPending}
        onSave={onSave}
        onCancel={closeForm}
      />
      {showGenerate ? (
        <GenerateQuestionsModal
          applicationId={applicationId}
          roundId={roundId}
          slotsLeft={slotsLeft}
          onClose={() => setShowGenerate(false)}
        />
      ) : null}
      {draft ? (
        <AnswerDraftModal
          key={`${draft.question.id}-${draft.version}`}
          question={draft.question.question}
          initialDraft={draft.text}
          isSaving={updateQuestion.isPending}
          isRegenerating={generateAnswer.isPending}
          onSave={saveDraft}
          onRegenerate={regenerateDraft}
          onDiscard={() => setDraft(null)}
        />
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1 },
    content: { padding: 16, gap: 12, paddingBottom: 96 },
    hint: { fontSize: 13, color: colors.textSubtle, lineHeight: 18 },
    usage: { fontSize: 13, color: colors.textFaint },
    generateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 48,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.primarySurface,
    },
    generateRowText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
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
      gap: 8,
    },
    question: { fontSize: 15, fontWeight: '700', color: colors.text, lineHeight: 21 },
    answer: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
    noAnswerBlock: { gap: 8 },
    noAnswer: { fontSize: 14, color: colors.textFaint, fontStyle: 'italic' },
    answerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    answerButton: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
    },
    answerButtonText: { fontSize: 13, fontWeight: '600', color: colors.text },
    answerButtonAi: { borderColor: colors.primary, backgroundColor: colors.primarySurface },
    answerButtonAiText: { color: colors.primary, fontWeight: '700' },
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
