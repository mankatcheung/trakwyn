import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FormLabel, Select } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import { documentCategory } from '#/lib/documentCategory';
import { documentsQueryOptions } from '../-documentQueries';
import { rememberUseProfile } from './mockBackgroundChoice';

export type MockBackground = { useProfile: boolean; documentId: string | null };

/**
 * Chooses what the AI may know about the candidate (JEF-394): their profile,
 * one uploaded resume, both or neither. It says plainly that this is sent to
 * their AI provider, since the profile is personal data.
 */
export function MockBackgroundPicker({
  applicationId,
  value,
  onChange,
}: {
  applicationId: string;
  value: MockBackground;
  onChange: (next: MockBackground) => void;
}) {
  const { t } = useLocale();
  const checkboxId = `background-profile-${useId()}`;
  const documentId = `background-document-${useId()}`;
  const { data } = useQuery(documentsQueryOptions(applicationId));
  const resumes = (data?.documents ?? []).filter(
    (d) => documentCategory(d.documentType) === 'resume',
  );

  return (
    <fieldset className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <legend className="px-1 text-xs font-semibold text-gray-700 dark:text-gray-300">
        {t('interviews.backgroundLegend')}
      </legend>
      <label
        htmlFor={checkboxId}
        className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"
      >
        <input
          id={checkboxId}
          type="checkbox"
          className="size-5 shrink-0"
          checked={value.useProfile}
          onChange={(e) => {
            rememberUseProfile(e.target.checked);
            onChange({ ...value, useProfile: e.target.checked });
          }}
        />
        <span className="text-gray-900 dark:text-gray-100">{t('interviews.useMyProfile')}</span>
      </label>
      {resumes.length > 0 && (
        <div>
          <FormLabel size="xs" htmlFor={documentId}>
            {t('interviews.useResume')}
          </FormLabel>
          <Select
            id={documentId}
            value={value.documentId ?? ''}
            onChange={(e) => onChange({ ...value, documentId: e.target.value || null })}
          >
            <option value="">{t('interviews.noResume')}</option>
            {resumes.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.name}
              </option>
            ))}
          </Select>
        </div>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {t('interviews.backgroundPrivacy')}
      </p>
    </fieldset>
  );
}
