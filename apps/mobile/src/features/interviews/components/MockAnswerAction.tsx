import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AiActionBar } from '../../ai/components/AiActionBar';
import type { MockInterviewQuestion } from '../types';

interface MockAnswerActionProps {
  question: MockInterviewQuestion;
  /** True while this question's draft is being written. */
  loading: boolean;
  /** True while any draft is being written: one at a time. */
  disabled: boolean;
  /** Starts the draft. The screen owns showing a failure. */
  onGenerate: (question: MockInterviewQuestion, prompt: string) => void;
}

/**
 * "Generate with AI" for one practice question, with its optional instructions
 * behind a toggle so the default stays one tap.
 */
export function MockAnswerAction({
  question,
  loading,
  disabled,
  onGenerate,
}: MockAnswerActionProps) {
  const { t } = useTranslation('interviews');
  const [prompt, setPrompt] = useState('');
  return (
    <AiActionBar
      feature="mockAnswer"
      variant="outline"
      label={t('generateAnswer')}
      loading={loading}
      disabled={disabled}
      onRun={() => onGenerate(question, prompt)}
      buttonTestID={`generate-answer-${question.id}`}
      instructions={{
        value: prompt,
        onChange: setPrompt,
        collapsible: true,
        placeholder: t('answerPromptPlaceholder'),
        inputTestID: `answer-prompt-input-${question.id}`,
        toggleTestID: `answer-instructions-toggle-${question.id}`,
      }}
    />
  );
}
