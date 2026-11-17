import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FormLabel, Select } from '@trakwyn/ui';
import { documentCategory } from '#/features/documents/lib/documentCategory';
import { DRAFT_PREFIX, FILE_PREFIX } from '../hooks/useResumeSourceChoice';
import { useLocale } from '#/lib/i18n';
import { documentDraftsQueryOptions, documentsQueryOptions } from '../graphql/documentQueries';

interface ResumeSourcePickerProps {
  applicationId: string;
  /** The draft being edited, left out of the list: a letter is not based on itself. */
  excludeDraftId?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Which of this application's resumes a cover letter is written from: an
 * uploaded file or a resume draft (JEF-396). The choice is sent as an id and
 * resolved on the server.
 */
export function ResumeSourcePicker({
  applicationId,
  excludeDraftId,
  value,
  onChange,
  disabled,
}: ResumeSourcePickerProps) {
  const { t } = useLocale();
  const pickerId = useId();
  const { data: documentsData } = useQuery(documentsQueryOptions(applicationId));
  const { data: draftsData } = useQuery(documentDraftsQueryOptions(applicationId));
  const resumeFiles = (documentsData?.documents ?? []).filter(
    (d) => documentCategory(d.documentType) === 'resume',
  );
  const resumeDrafts = (draftsData?.documentDrafts ?? []).filter(
    (d) => d.id !== excludeDraftId && documentCategory(d.type) === 'resume',
  );

  return (
    <div>
      <FormLabel size="xs" htmlFor={pickerId}>
        {t('documentDraft.baseOnResumeLabel')}
      </FormLabel>
      <Select
        id={pickerId}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t('documentDraft.noResumeOption')}</option>
        {resumeFiles.length > 0 && (
          <optgroup label={t('documentDraft.resumeFilesGroup')}>
            {resumeFiles.map((doc) => (
              <option key={doc.id} value={`${FILE_PREFIX}${doc.id}`}>
                {doc.name}
              </option>
            ))}
          </optgroup>
        )}
        {resumeDrafts.length > 0 && (
          <optgroup label={t('documentDraft.resumeDraftsGroup')}>
            {resumeDrafts.map((draft) => (
              <option key={draft.id} value={`${DRAFT_PREFIX}${draft.id}`}>
                {draft.title}
              </option>
            ))}
          </optgroup>
        )}
      </Select>
    </div>
  );
}
