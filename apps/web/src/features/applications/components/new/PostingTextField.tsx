import type { UseFormRegisterReturn } from 'react-hook-form';
import { FormLabel, Textarea } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';

/** `FIELD_LENGTH_LIMITS.POSTING_TEXT` in the API, which refuses anything longer. */
export const POSTING_TEXT_MAX_CHARS = 15_000;

interface Props {
  registration: UseFormRegisterReturn;
  error?: string;
}

/**
 * The full job posting (JEF-591), kept beside the short description. The AI
 * features read this one, because a summary drops the keywords an employer
 * screens for. "Auto-fill from job posting" fills it; it can also be pasted.
 */
export function PostingTextField({ registration, error }: Props) {
  const { t } = useLocale();
  return (
    <div>
      <FormLabel htmlFor="posting-text">{t('applicationForm.postingTextLabel')}</FormLabel>
      <Textarea
        id="posting-text"
        {...registration}
        className="h-40"
        maxLength={POSTING_TEXT_MAX_CHARS}
        placeholder={t('applicationForm.postingTextPlaceholder')}
        aria-describedby="posting-text-hint"
        invalid={!!error}
      />
      <p id="posting-text-hint" className="mt-1 text-xs text-stone-500 dark:text-stone-400">
        {t('applicationForm.postingTextHint')}
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
