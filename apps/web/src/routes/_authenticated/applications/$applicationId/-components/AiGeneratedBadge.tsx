import { SparklesIcon } from 'lucide-react';
import { useLocale } from '#/lib/i18n';

/** Marks an answer that began as an AI draft. It stays however the text is edited later. */
export function AiGeneratedBadge({ label }: { label?: string }) {
  const { t } = useLocale();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800 dark:bg-violet-900/30 dark:text-violet-200">
      <SparklesIcon size={12} aria-hidden="true" />
      {label ?? t('interviews.aiGenerated')}
    </span>
  );
}
