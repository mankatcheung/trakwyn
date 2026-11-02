import type { ReactNode } from 'react';
import { PlusIcon } from 'lucide-react';
import { Alert, Button, Card } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import { getErrorMessage } from '#/lib/errors';
import { QuotaHint } from '#/components/QuotaHint';
import { useQuotaState, type QuotaResource } from '#/lib/contentQuota';

interface ProfileSectionProps {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  onAdd: () => void;
  /** Which cap the Add button is subject to, and how many the user holds (JEF-494). */
  quota?: { resource: QuotaResource; used: number };
  /** The create mutation's error, shown with the API's own message (a cap reached by a race names its limit). */
  createError?: unknown;
  children: ReactNode;
}

/** One card on the profile page, with its heading and Add button. `id` is the in-page nav anchor. */
export function ProfileSection({
  id,
  icon,
  title,
  description,
  onAdd,
  quota,
  createError,
  children,
}: ProfileSectionProps) {
  const { t } = useLocale();
  const state = useQuotaState(quota?.resource ?? 'skills', quota?.used);
  const full = !!quota && state?.level === 'full';
  return (
    // scroll-mt clears the fixed mobile header when the in-page nav jumps here.
    <Card id={id} className="scroll-mt-20 space-y-4 p-5 sm:p-6 lg:scroll-mt-8">
      <section aria-labelledby={`${id}-heading`} className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2
              id={`${id}-heading`}
              className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100"
            >
              {icon} {title}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
          </div>
          <Button variant="link" size="sm" onClick={onAdd} disabled={full}>
            <span className="flex items-center gap-1.5">
              <PlusIcon size={14} /> <span className="hidden sm:inline">{t('common.add')}</span>
            </span>
          </Button>
        </div>
        {quota && <QuotaHint resource={quota.resource} used={quota.used} />}
        {createError != null && <Alert role="alert">{getErrorMessage(createError)}</Alert>}
        {children}
      </section>
    </Card>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
}

interface FormActionsProps {
  submitting: boolean;
  editing: boolean;
  onCancel: () => void;
}

export function FormActions({ submitting, editing, onCancel }: FormActionsProps) {
  const { t } = useLocale();
  return (
    <div className="flex items-center gap-2">
      <Button type="submit" disabled={submitting}>
        {submitting
          ? t('applicationForm.saving')
          : editing
            ? t('experience.update')
            : t('common.add')}
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
    </div>
  );
}

export const ENTRY_CLASS =
  'flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700';

export const FORM_CLASS =
  'space-y-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-800 dark:bg-blue-900/10';
