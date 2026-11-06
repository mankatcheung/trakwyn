import { useRef, useState } from 'react';
import { useLocale } from '#/lib/i18n';

interface DraftTitleFieldProps {
  title: string;
  /** What the title falls back to when empty: the draft type's name. */
  placeholder: string;
  /** Saves the new title. Resolves to whether it was saved. */
  onCommit: (title: string) => Promise<boolean>;
}

/**
 * The draft's title as an inline field (JEF-506). Blur or Enter saves it; an
 * empty or unchanged title saves nothing and puts the previous one back, and
 * so does a save that fails (the page says why).
 *
 * It shows the saved `title` unless the user has an edit in progress. The edit
 * is not copied from the prop by an effect: an effect that resets the text to
 * `title` on mount can run after the user's first keystroke and throw it away.
 */
export function DraftTitleField({ title, placeholder, onCommit }: DraftTitleFieldProps) {
  const { t } = useLocale();
  // `null` means no edit in progress: the field shows the saved title.
  const [edit, setEdit] = useState<string | null>(null);
  const value = edit ?? title;
  // Escape blurs the field, and the blur must not save what Escape just threw away.
  const cancelledRef = useRef(false);

  const commit = async () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    const next = value.trim();
    if (!next || next === title) {
      setEdit(null);
      return;
    }
    setEdit(next);
    // Saved or not, the field goes back to showing the title: the new one once
    // the page has stored it, the previous one when the save failed.
    await onCommit(next);
    setEdit(null);
  };

  return (
    <input
      value={value}
      placeholder={placeholder}
      maxLength={200}
      aria-label={t('documentDraftEdit.renameAria')}
      onChange={(e) => setEdit(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          cancelledRef.current = true;
          setEdit(null);
          e.currentTarget.blur();
          // Not focused, so no blur followed: there is nothing to cancel.
          cancelledRef.current = false;
        }
      }}
      className="w-full min-w-0 rounded-sm border border-transparent bg-transparent px-1 text-xl font-bold text-gray-900 hover:border-gray-200 focus:border-blue-500 focus:outline-none dark:text-gray-100 dark:hover:border-gray-700"
    />
  );
}
