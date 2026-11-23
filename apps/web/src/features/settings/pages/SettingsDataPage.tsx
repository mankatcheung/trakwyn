import { DownloadIcon, UploadIcon } from 'lucide-react';
import { useState } from 'react';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { Alert, Card } from '@trakwyn/ui';
import { StorageCard } from '../components/account/StorageCard';
import { EXPORT_USER_DATA, IMPORT_USER_DATA } from '../graphql/accountQueries';
import type { ImportSummary } from '../lib/account/accountTypes';
import { extractGqlError } from '../lib/gqlErrors';

export function SettingsDataPage() {
  const { t } = useLocale();

  // Export
  const onExport = async () => {
    try {
      const res = (await gqlClient.request(EXPORT_USER_DATA)) as { exportUserData: string };
      const blob = new Blob([res.exportUserData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trakwyn-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent — export errors are non-critical
    }
  };

  // Import
  const [importResult, setImportResult] = useState<ImportSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const text = await file.text();
      const res = (await gqlClient.request(IMPORT_USER_DATA, {
        data: text,
      })) as { importUserData: ImportSummary };
      setImportResult(res.importUserData);
    } catch (err) {
      setImportError(extractGqlError(err) ?? t('data.importFailed'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* ── Storage ── */}
      <StorageCard />

      {/* ── Export ── */}
      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-medium text-stone-900 dark:text-stone-100">
            {t('data.exportTitle')}
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {t('data.exportDescription')}
          </p>
        </div>
        <button
          type="button"
          onClick={onExport}
          aria-label={t('data.downloadExport')}
          className="flex items-center gap-1.5 rounded-lg bg-stone-100 px-4 py-2 text-sm font-medium text-stone-900 transition-colors hover:bg-stone-200 dark:bg-stone-700 dark:text-stone-100 dark:hover:bg-stone-600"
        >
          <DownloadIcon size={14} />{' '}
          <span className="hidden sm:inline">{t('data.downloadExport')}</span>
        </button>
      </Card>

      {/* ── Import ── */}
      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-medium text-stone-900 dark:text-stone-100">
            {t('data.importTitle')}
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {t('data.importDescription')}
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-stone-100 px-4 py-2 text-sm font-medium text-stone-900 transition-colors hover:bg-stone-200 dark:bg-stone-700 dark:text-stone-100 dark:hover:bg-stone-600">
          <UploadIcon size={14} />{' '}
          <span className="hidden sm:inline">
            {importing ? t('data.importing') : t('data.chooseFileToImport')}
          </span>
          <input
            type="file"
            accept="application/json"
            onChange={onImport}
            disabled={importing}
            className="hidden"
          />
        </label>
        {importError && <Alert>{importError}</Alert>}
        {importResult && (
          <p className="text-sm text-green-600">
            {t('data.importedApplications', { count: importResult.applicationsImported })}{' '}
            {t('data.andNotes', { count: importResult.notesImported })}
            {importResult.applicationsSkipped > 0 &&
              ` ${t('data.skippedApplications', { count: importResult.applicationsSkipped })}`}
            {importResult.documentsSkipped > 0 &&
              ` ${t('data.skippedDocuments', { count: importResult.documentsSkipped })}`}
          </p>
        )}
      </Card>
    </div>
  );
}
