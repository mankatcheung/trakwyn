import { DownloadIcon, UploadIcon } from 'lucide-react';
import { useState } from 'react';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { Alert, Card } from '@trakwyn/ui';
import { StorageCard } from './StorageCard';
import { EXPORT_USER_DATA, IMPORT_USER_DATA, type ImportSummary, extractGqlError } from './shared';

export function SettingsDataPage() {
  const { t } = useLocale();

  // Export
  const onExport = async () => {
    try {
      const res = await gqlClient.request<{ exportUserData: string }>(EXPORT_USER_DATA);
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
      const res = await gqlClient.request<{ importUserData: ImportSummary }>(IMPORT_USER_DATA, {
        data: text,
      });
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
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('data.exportTitle')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('data.exportDescription')}</p>
        </div>
        <button
          type="button"
          onClick={onExport}
          aria-label={t('data.downloadExport')}
          className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
        >
          <DownloadIcon size={14} />{' '}
          <span className="hidden sm:inline">{t('data.downloadExport')}</span>
        </button>
      </Card>

      {/* ── Import ── */}
      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('data.importTitle')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('data.importDescription')}</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600">
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
