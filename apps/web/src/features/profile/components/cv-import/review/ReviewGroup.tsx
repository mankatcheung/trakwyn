import { useState, type ReactNode } from 'react';
import { CheckIcon, PencilIcon } from 'lucide-react';
import { Badge, Button, Checkbox, IconButton } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import { setAllSelected, updateDraft, type Draft } from '../../../lib/cvImportDrafts';

interface ReviewGroupProps<T> {
  id: string;
  title: string;
  icon: ReactNode;
  drafts: Draft<T>[];
  disabled: boolean;
  onChange: (next: Draft<T>[]) => void;
  labelOf: (value: T) => string;
  isValid: (value: T) => boolean;
  summary: (value: T) => ReactNode;
  fields: (value: T, update: (patch: Partial<T>) => void) => ReactNode;
}

export function ReviewGroup<T>({
  id,
  title,
  icon,
  drafts,
  disabled,
  onChange,
  labelOf,
  isValid,
  summary,
  fields,
}: ReviewGroupProps<T>) {
  const { t } = useLocale();
  const [editing, setEditing] = useState<ReadonlySet<string>>(new Set());

  if (drafts.length === 0) return null;

  const selected = drafts.filter((draft) => draft.selected).length;
  const allSelected = selected === drafts.length;
  const toggleEditing = (draftId: string) =>
    setEditing((current) => {
      const next = new Set(current);
      if (!next.delete(draftId)) next.add(draftId);
      return next;
    });

  return (
    <section aria-labelledby={`cv-import-${id}`} className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3
          id={`cv-import-${id}`}
          className="flex items-center gap-2 text-sm font-medium text-stone-900 dark:text-stone-100"
        >
          {icon} {title}
          <span className="font-normal text-stone-500 dark:text-stone-400">
            {selected}/{drafts.length}
          </span>
        </h3>
        <Button
          variant="link"
          size="sm"
          disabled={disabled}
          onClick={() => onChange(setAllSelected(drafts, !allSelected))}
        >
          {allSelected ? t('cvImport.selectNone') : t('cvImport.selectAll')}
        </Button>
      </div>
      <ul className="space-y-2">
        {drafts.map((draft) => {
          const valid = isValid(draft.value);
          const isEditing = editing.has(draft.id);
          const update = (patch: Partial<T>) =>
            onChange(
              updateDraft(drafts, draft.id, (current) => ({
                ...current,
                value: { ...current.value, ...patch },
              })),
            );
          return (
            <li
              key={draft.id}
              className={[
                'flex items-start gap-3 rounded-lg border p-3',
                draft.selected && !valid
                  ? 'border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10'
                  : 'border-stone-200 dark:border-stone-700',
                draft.selected ? '' : 'opacity-70',
              ].join(' ')}
            >
              <Checkbox
                className="mt-1"
                checked={draft.selected}
                disabled={disabled}
                aria-label={t('cvImport.include', { name: labelOf(draft.value) })}
                onChange={(e) =>
                  onChange(
                    updateDraft(drafts, draft.id, (current) => ({
                      ...current,
                      selected: e.target.checked,
                    })),
                  )
                }
              />
              <div className="min-w-0 flex-1 space-y-2">
                {isEditing ? fields(draft.value, update) : summary(draft.value)}
                {draft.alreadyInProfile && (
                  <Badge tone="gray">{t('cvImport.alreadyInProfile')}</Badge>
                )}
              </div>
              <IconButton
                label={isEditing ? t('common.done') : t('common.edit')}
                icon={isEditing ? <CheckIcon size={14} /> : <PencilIcon size={14} />}
                variant="subtle"
                disabled={disabled}
                onClick={() => toggleEditing(draft.id)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
