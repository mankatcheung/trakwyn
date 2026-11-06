import { Button } from '@trakwyn/ui';
import { Markdown } from '#/components/Markdown';
import { useLocale } from '#/lib/i18n';

interface PolishPreviewProps {
  markdown: string;
  onReplace: () => void;
  onInsert: () => void;
  onDiscard: () => void;
  /** The draft changed after this was written: replacing it would drop those edits. */
  stale?: boolean;
}

/** The polished text, shown beside the editor with nothing applied until a button is pressed. */
export function PolishPreview({
  markdown,
  onReplace,
  onInsert,
  onDiscard,
  stale,
}: PolishPreviewProps) {
  const { t } = useLocale();
  return (
    <section
      aria-label={t('aiHelper.previewTitle')}
      className="space-y-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
    >
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {t('aiHelper.previewTitle')}
      </p>
      <div className="max-h-96 overflow-y-auto text-sm text-gray-900 dark:text-gray-100">
        <Markdown content={markdown} />
      </div>
      {stale && (
        <p role="status" className="text-xs text-amber-700 dark:text-amber-400">
          {t('aiHelper.stale')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!stale && (
          <Button type="button" size="sm" onClick={onReplace}>
            {t('aiHelper.replace')}
          </Button>
        )}
        <Button type="button" size="sm" variant="secondary" onClick={onInsert}>
          {t('aiHelper.insertBelow')}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onDiscard}>
          {t('aiHelper.discard')}
        </Button>
      </div>
    </section>
  );
}
