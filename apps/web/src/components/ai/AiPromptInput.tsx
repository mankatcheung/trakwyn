import { useEffect, useId, useState } from 'react';
import { FormLabel, Textarea } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';

export const AI_PROMPT_MAX_LENGTH = 500;
const ROTATE_MS = 4000;

interface AiPromptInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Example instructions, cycled through as the placeholder. */
  placeholderExamples?: readonly string[];
  maxLength?: number;
  label?: string;
  disabled?: boolean;
}

/** An optional instruction box with a character counter. */
export function AiPromptInput({
  value,
  onChange,
  placeholderExamples = [],
  maxLength = AI_PROMPT_MAX_LENGTH,
  label,
  disabled,
}: AiPromptInputProps) {
  const { t } = useLocale();
  const id = useId();
  const [exampleIndex, setExampleIndex] = useState(0);

  useEffect(() => {
    if (placeholderExamples.length < 2) return;
    const timer = setInterval(
      () => setExampleIndex((i) => (i + 1) % placeholderExamples.length),
      ROTATE_MS,
    );
    return () => clearInterval(timer);
  }, [placeholderExamples.length]);

  return (
    <div>
      <FormLabel size="xs" htmlFor={id}>
        {label ?? t('aiHelper.promptLabel')}
      </FormLabel>
      <Textarea
        id={id}
        rows={3}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={placeholderExamples[exampleIndex % (placeholderExamples.length || 1)]}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
      />
      <p className="mt-1 text-right text-xs text-gray-500 dark:text-gray-400">
        {value.length}/{maxLength}
      </p>
    </div>
  );
}
