import { PlusIcon } from 'lucide-react';
import { QuotaHint } from '#/components/QuotaHint';
import { useQuotaState } from '#/lib/contentQuota';
import { useLocale } from '#/lib/i18n';
import type { DocumentDraft } from '../-documentQueries';
import { findBlankDraft, useCreateOrOpenDraft, type DraftType } from './useCreateOrOpenDraft';

const CLASS =
  'flex min-h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60';

interface CreateDraftButtonProps {
  applicationId: string;
  type: DraftType;
  /** All of the application's drafts, as the tab already holds them. */
  drafts: readonly DocumentDraft[];
}

/**
 * The "Create new" button of the Resumes and Cover letters tabs. At the draft
 * cap it is disabled, unless there is a blank draft it would open instead of
 * creating one.
 */
export function CreateDraftButton({ applicationId, type, drafts }: CreateDraftButtonProps) {
  const { t } = useLocale();
  const { run, pending, error } = useCreateOrOpenDraft(applicationId, type);
  const full = useQuotaState('documentDrafts', drafts.length)?.level === 'full';
  const blocked = full && !findBlankDraft(drafts, type);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void run()}
        disabled={pending || blocked}
        className={CLASS}
      >
        <PlusIcon size={16} aria-hidden="true" />
        {t('documents.createNew')}
      </button>
      <QuotaHint resource="documentDrafts" used={drafts.length} />
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
