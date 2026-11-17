import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, FormLabel, Input, SubmitButton, Textarea } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import { useFormAction } from '#/lib/useFormAction';
import { INTERVIEW_QUESTION_LIMITS } from './interviewQuestionLimits';
import { questionFormSchema, type QuestionFormValues } from './questionFormSchema';

interface QuestionEntryFormProps {
  initial: QuestionFormValues;
  /** Prefix for the field ids, so the two panels never share one. */
  idPrefix: string;
  questionPlaceholder: string;
  answerLabel: string;
  answerPlaceholder: string;
  /** Saves the values; returns the message to show when the save failed. */
  onSubmit: (values: QuestionFormValues) => Promise<string | null>;
  onCancel: () => void;
}

/**
 * One question and its optional answer, for adding or editing (JEF-619).
 * Used by `InterviewQuestionsPanel` and `MockQuestionsPanel`.
 */
export function QuestionEntryForm({
  initial,
  idPrefix,
  questionPlaceholder,
  answerLabel,
  answerPlaceholder,
  onSubmit,
  onCancel,
}: QuestionEntryFormProps) {
  const { t } = useLocale();
  const form = useForm<QuestionFormValues>({
    resolver: zodResolver(questionFormSchema),
    defaultValues: initial,
  });
  const { errors } = form.formState;
  const { state, formProps } = useFormAction(form, onSubmit);
  const questionId = `${idPrefix}-question-${useId()}`;
  const answerId = `${idPrefix}-answer-${useId()}`;

  return (
    <form
      {...formProps}
      className="space-y-3 rounded-lg border-2 border-blue-600 bg-blue-50/40 p-3 dark:bg-blue-900/10"
    >
      <div>
        <FormLabel size="xs" htmlFor={questionId}>
          {t('interviews.questionLabel')}
        </FormLabel>
        <Input
          id={questionId}
          maxLength={INTERVIEW_QUESTION_LIMITS.QUESTION_MAX_CHARS}
          placeholder={questionPlaceholder}
          autoFocus
          aria-invalid={errors.question ? true : undefined}
          {...form.register('question')}
        />
        {errors.question && <p className="mt-1 text-xs text-red-600">{errors.question.message}</p>}
      </div>
      <div>
        <FormLabel size="xs" htmlFor={answerId}>
          {answerLabel}{' '}
          <span className="font-normal text-gray-500">{t('interviews.responseOptional')}</span>
        </FormLabel>
        <Textarea
          id={answerId}
          maxLength={INTERVIEW_QUESTION_LIMITS.ANSWER_MAX_CHARS}
          className="h-24"
          placeholder={answerPlaceholder}
          aria-invalid={errors.answer ? true : undefined}
          {...form.register('answer')}
        />
        {errors.answer && <p className="mt-1 text-xs text-red-600">{errors.answer.message}</p>}
      </div>
      {state.error && <Alert role="alert">{state.error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <SubmitButton size="sm" pendingLabel={t('applicationForm.saving')}>
          {t('common.save')}
        </SubmitButton>
      </div>
    </form>
  );
}
