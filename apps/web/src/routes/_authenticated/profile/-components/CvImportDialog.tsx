import { useRef, useState, type DragEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LockIcon, UploadIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Button, Modal, Spinner } from '@trakwyn/ui';
import { AiErrorMessage } from '#/components/AiErrorMessage';
import { ERROR_CODES } from '#/constants';
import { gqlClient } from '#/graphql/client';
import {
  CV_IMPORT_ACCEPT,
  CV_IMPORT_MAX_MB,
  CvImportError,
  uploadCv,
  validateCvFile,
  type CvFileProblem,
} from '#/lib/cvImport';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import { CvImportReview } from './CvImportReview';
import {
  countSelected,
  hasInvalidSelection,
  isEmpty,
  toDrafts,
  toImportInput,
  type CvDrafts,
} from './cvImportDrafts';
import {
  IMPORT_CV_PROFILE,
  educationsQueryOptions,
  skillsQueryOptions,
  workExperiencesQueryOptions,
} from './profileQueries';

/**
 * Import the profile from a CV (JEF-461). Three steps in one dialog: choose a
 * file, read it (the file goes to the API, is read once and is not stored),
 * then review what was found and save the rows that are ticked.
 */

interface CvImportDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Mounted only while open, so every visit starts from the file picker. */
export function CvImportDialog({ open, onClose }: CvImportDialogProps) {
  if (!open) return null;
  return <CvImportFlow onClose={onClose} />;
}

type Phase = 'choose' | 'reading' | 'review';

interface Problem {
  code: string;
  message: string;
}

const PROBLEM_KEYS: Record<CvFileProblem, string> = {
  unsupported: 'cvImport.errorUnsupported',
  doc: 'cvImport.errorDoc',
  empty: 'cvImport.errorEmpty',
  tooLarge: 'cvImport.errorTooLarge',
};

interface ImportResult {
  importCvProfile: { workExperiences: number; educations: number; skills: number };
}

function CvImportFlow({ onClose }: { onClose: () => void }) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>('choose');
  const [fileName, setFileName] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [drafts, setDrafts] = useState<CvDrafts | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [dragging, setDragging] = useState(false);
  const reading = useRef<AbortController | null>(null);

  const save = useMutation({
    mutationFn: (rows: CvDrafts) =>
      gqlClient.request<ImportResult>(IMPORT_CV_PROFILE, { input: toImportInput(rows) }),
    onSuccess: ({ importCvProfile: added }) => {
      for (const options of [
        workExperiencesQueryOptions,
        educationsQueryOptions,
        skillsQueryOptions,
      ]) {
        void queryClient.invalidateQueries({ queryKey: options.queryKey });
      }
      toast.success(
        t('cvImport.success', {
          work: added.workExperiences,
          education: added.educations,
          skills: added.skills,
        }),
      );
      onClose();
    },
  });
  const saving = save.isPending;
  // `isPending` only flips on the next render, so a second click can land before
  // the button is disabled. The API does not de-duplicate, so twice would add
  // every row twice; this is set synchronously, in the same tick as the click.
  const saveStarted = useRef(false);
  const submit = () => {
    if (!drafts || saveStarted.current) return;
    saveStarted.current = true;
    save.mutate(drafts, {
      onSettled: () => {
        saveStarted.current = false;
      },
    });
  };

  const stopReading = () => {
    reading.current?.abort();
    reading.current = null;
  };

  const close = () => {
    stopReading();
    onClose();
  };

  const refuse = (message: string, code: string = ERROR_CODES.VALIDATION) => {
    setProblem({ code, message });
    setPhase('choose');
  };

  const readFile = async (file: File) => {
    const fileProblem = validateCvFile(file);
    if (fileProblem) {
      refuse(t(PROBLEM_KEYS[fileProblem], { size: CV_IMPORT_MAX_MB }));
      return;
    }

    setProblem(null);
    setFileName(file.name);
    setPhase('reading');
    const controller = new AbortController();
    reading.current = controller;
    try {
      const parsed = await uploadCv(file, controller.signal);
      const rows = toDrafts(parsed);
      if (isEmpty(rows)) {
        refuse(t('cvImport.errorNothingFound'));
        return;
      }
      setDrafts(rows);
      setTruncated(parsed.truncated);
      setPhase('review');
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof CvImportError) {
        refuse(error.message || t('cvImport.errorGeneric'), error.code);
      } else {
        refuse(t('cvImport.errorGeneric'), ERROR_CODES.INTERNAL_ERROR);
      }
    } finally {
      if (reading.current === controller) reading.current = null;
    }
  };

  const chooseAnother = () => {
    save.reset();
    setDrafts(null);
    setProblem(null);
    setPhase('choose');
  };

  const cancelReading = () => {
    stopReading();
    setPhase('choose');
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void readFile(file);
  };

  const selected = drafts ? countSelected(drafts) : 0;
  const invalid = drafts ? hasInvalidSelection(drafts) : false;

  return (
    <Modal open onClose={saving ? () => undefined : close} title={t('cvImport.title')} size="lg">
      {phase === 'choose' && (
        <div className="space-y-4 p-4 sm:p-5">
          <p className="text-sm text-gray-600 dark:text-gray-300">{t('cvImport.intro')}</p>
          {problem && (
            <Alert role="alert">
              <AiErrorMessage code={problem.code} fallback={problem.message} />
            </Alert>
          )}
          <label
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={[
              'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors focus-within:ring-2 focus-within:ring-blue-500',
              dragging
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-300 hover:border-blue-400 dark:border-gray-600',
            ].join(' ')}
          >
            <input
              type="file"
              accept={CV_IMPORT_ACCEPT}
              className="sr-only"
              data-testid="cv-import-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                // Cleared so choosing the same file again (after fixing it) still fires.
                event.target.value = '';
                if (file) void readFile(file);
              }}
            />
            <UploadIcon size={28} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {t('cvImport.dropPrompt')}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t('cvImport.dropHint', { size: CV_IMPORT_MAX_MB })}
            </span>
          </label>
          <p className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
            <LockIcon size={13} className="mt-0.5 shrink-0" />
            {t('cvImport.privacy')}
          </p>
        </div>
      )}

      {phase === 'reading' && (
        <div role="status" className="flex flex-col items-center gap-3 px-4 py-14 text-center">
          <Spinner size="md" />
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {t('cvImport.reading', { name: fileName })}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('cvImport.readingHint')}</p>
          <Button variant="ghost" size="sm" onClick={cancelReading}>
            {t('common.cancel')}
          </Button>
        </div>
      )}

      {phase === 'review' && drafts && (
        <>
          <div className="p-4 sm:p-5">
            <CvImportReview
              drafts={drafts}
              onChange={setDrafts}
              truncated={truncated}
              disabled={saving}
            />
            {save.isError && (
              <Alert role="alert" className="mt-4">
                {getErrorMessage(save.error)}
              </Alert>
            )}
          </div>
          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-white px-4 py-3 sm:px-5 dark:border-gray-700 dark:bg-gray-800">
            <Button variant="ghost" onClick={chooseAnother} disabled={saving}>
              {t('cvImport.chooseAnother')}
            </Button>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {invalid && (
                <span className="text-xs text-red-600">{t('cvImport.invalidSelection')}</span>
              )}
              <Button onClick={submit} disabled={saving || selected === 0 || invalid}>
                {saving
                  ? t('cvImport.importing')
                  : t('cvImport.importSelected', { count: selected })}
              </Button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
