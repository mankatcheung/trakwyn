import { useEffect, useState } from 'react';
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
 */
export function DraftTitleField({ title, placeholder, onCommit }: DraftTitleFieldProps) {
  const { t } = useLocale();
  const [value, setValue] = useState(title);

  useEffect(() => setValue(title), [title]);

  const commit = async () => {
    const next = value.trim();
    if (!next || next === title) {
      setValue(title);
      return;
    }
    setValue(next);
    if (!(await onCommit(next))) setValue(title);
  };

  return (
    <input
      value={value}
      placeholder={placeholder}
      maxLength={200}
      aria-label={t('documentDraftEdit.renameAria')}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setValue(title);
          e.currentTarget.blur();
        }
      }}
      className="w-full min-w-0 rounded-sm border border-transparent bg-transparent px-1 text-xl font-bold text-gray-900 hover:border-gray-200 focus:border-blue-500 focus:outline-none dark:text-gray-100 dark:hover:border-gray-700"
    />
  );
}
