import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { FileTextIcon, MoreVerticalIcon, PencilIcon } from 'lucide-react';
import { useLocale } from '#/lib/i18n';
import { fileExtension } from '#/lib/documentListItems';
import { Badge, Button, Menu, type MenuItem } from '@trakwyn/ui';
import { isPreviewableMimeType } from './DocumentPreviewModal';
import { ResumeMatch } from './ResumeMatchPanel';
import { ResumeAts } from './ResumeAtsPanel';
import type { ResumeRef } from '../-resumeMatchQueries';
import type { Document, DocumentDraft } from '../-documentQueries';

const ACTION_BUTTON_CLASS =
  'inline-flex min-h-9 items-center rounded-lg border border-gray-300 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700';

interface RowShellProps {
  /** Blue for a draft, grey for a file, so the two read apart before any text. */
  tile: ReactNode;
  tileClass: string;
  title: ReactNode;
  badges: ReactNode;
  meta: string;
  primary: ReactNode;
  menuItems: MenuItem[];
  onMenuSelect: (id: string) => void;
  /** Set on Resumes, where each row carries its ATS check (JEF-395) and its match (JEF-397). */
  matchResume?: ResumeRef;
  applicationId: string;
}

function RowShell({
  tile,
  tileClass,
  title,
  badges,
  meta,
  primary,
  menuItems,
  onMenuSelect,
  matchResume,
  applicationId,
}: RowShellProps) {
  const { t } = useLocale();

  const render = (chip: ReactNode, details: ReactNode) => (
    <li className="border-b border-gray-200 last:border-b-0 dark:border-gray-700">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 px-4 py-3.5">
        <div
          aria-hidden="true"
          className={`flex size-11 shrink-0 items-center justify-center rounded-[10px] ${tileClass}`}
        >
          {tile}
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            {title}
            {badges}
          </div>
          <span className="text-sm text-gray-600 dark:text-gray-400">{meta}</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {chip}
          {primary}
          <Menu
            label={t('documents.moreActions')}
            items={menuItems}
            onSelect={onMenuSelect}
            trigger={(props) => (
              <button
                type="button"
                {...props}
                aria-label={t('documents.moreActions')}
                className="flex size-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                <MoreVerticalIcon size={18} aria-hidden="true" />
              </button>
            )}
          />
        </div>
      </div>
      {details && (
        <div className="border-t border-gray-100 bg-gray-50 p-4 sm:pl-19 dark:border-gray-700 dark:bg-gray-900/40">
          {details}
        </div>
      )}
    </li>
  );

  if (!matchResume) return render(null, null);
  return (
    <ResumeAts applicationId={applicationId} resume={matchResume}>
      {(ats) => (
        <ResumeMatch applicationId={applicationId} resume={matchResume}>
          {(match) =>
            render(
              <>
                {ats.chip}
                {match.chip}
              </>,
              ats.details || match.details ? (
                <div className="space-y-4">
                  {ats.details}
                  {match.details}
                </div>
              ) : null,
            )
          }
        </ResumeMatch>
      )}
    </ResumeAts>
  );
}

interface DraftRowProps {
  applicationId: string;
  draft: DocumentDraft;
  /** Resumes carry a match; cover letters do not. */
  withMatch: boolean;
  onDelete: (draft: DocumentDraft) => void;
}

export function DraftRow({ applicationId, draft, withMatch, onDelete }: DraftRowProps) {
  const { t, formatDate } = useLocale();
  const editParams = { applicationId, draftId: draft.id };
  return (
    <RowShell
      applicationId={applicationId}
      tile={<PencilIcon size={20} />}
      tileClass="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
      title={
        <Link
          to="/applications/$applicationId/documents/$draftId"
          params={editParams}
          className="truncate text-[15px] font-semibold text-gray-900 hover:underline dark:text-gray-100"
        >
          {draft.title}
        </Link>
      }
      badges={
        <Badge tone="blue" className="shrink-0 uppercase">
          {t('documents.draftBadge')}
        </Badge>
      }
      meta={t('documents.editedOn', {
        date: formatDate(new Date(draft.updatedAt), { dateStyle: 'medium' }),
      })}
      primary={
        <Link
          to="/applications/$applicationId/documents/$draftId"
          params={editParams}
          className={ACTION_BUTTON_CLASS}
        >
          {t('documents.edit')}
        </Link>
      }
      menuItems={[{ id: 'delete', label: t('common.delete'), destructive: true }]}
      onMenuSelect={(id) => id === 'delete' && onDelete(draft)}
      matchResume={withMatch ? { documentDraftId: draft.id } : undefined}
    />
  );
}

interface FileRowProps {
  applicationId: string;
  document: Document;
  withMatch: boolean;
  /** Other mixes types, so a portfolio file says so; the other tabs do not. */
  showPortfolioBadge: boolean;
  onPreview: (document: Document) => void;
  onDelete: (document: Document) => void;
}

export function FileRow({
  applicationId,
  document,
  withMatch,
  showPortfolioBadge,
  onPreview,
  onDelete,
}: FileRowProps) {
  const { t, formatDate } = useLocale();
  const extension = fileExtension(document.name, document.mimeType);
  const previewable = isPreviewableMimeType(document.mimeType);
  const meta = [
    t('documents.uploadedOn', {
      date: formatDate(new Date(document.createdAt), { dateStyle: 'medium' }),
    }),
    `${(document.sizeBytes / 1024).toFixed(1)} KB`,
    ...(document.version ? [document.version] : []),
  ].join(' · ');

  return (
    <RowShell
      applicationId={applicationId}
      tile={<FileTextIcon size={20} />}
      tileClass="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
      title={
        <span className="truncate text-[15px] font-semibold text-gray-900 dark:text-gray-100">
          {document.name}
        </span>
      }
      badges={
        <>
          {extension && (
            <Badge tone="gray" className="shrink-0 border border-gray-300 dark:border-gray-600">
              {extension}
            </Badge>
          )}
          {showPortfolioBadge && document.documentType === 'portfolio' && (
            <Badge tone="green" className="shrink-0">
              {t('documents.portfolio')}
            </Badge>
          )}
        </>
      }
      meta={meta}
      primary={
        previewable ? (
          <Button variant="secondary" onClick={() => onPreview(document)}>
            {t('documents.preview')}
          </Button>
        ) : (
          <a
            href={document.url}
            target="_blank"
            rel="noopener noreferrer"
            className={ACTION_BUTTON_CLASS}
          >
            {t('documents.download')}
          </a>
        )
      }
      menuItems={[
        { id: 'open', label: t('documents.openInNewTab') },
        { id: 'delete', label: t('common.delete'), destructive: true, separated: true },
      ]}
      onMenuSelect={(id) => {
        if (id === 'delete') onDelete(document);
        else if (id === 'open') window.open(document.url, '_blank', 'noopener,noreferrer');
      }}
      matchResume={withMatch ? { documentId: document.id } : undefined}
    />
  );
}
