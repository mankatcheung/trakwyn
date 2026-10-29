import { useEffect, useState } from 'react';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { Alert, Button, Modal } from '@trakwyn/ui';
import { extractGqlErrorCode } from './shared';
import { StepUpPasswordForm } from './StepUpPasswordForm';
import { StepUpWithoutPassword, type ReauthProvider } from './StepUpWithoutPassword';

/** Thrown to the caller of `withStepUp` when the user dismisses the reauth dialog instead of completing it. */
export const STEP_UP_CANCELLED = 'step-up-cancelled';

/** How the API says this user can step up (JEF-463), in the order to offer them. */
const STEP_UP_METHODS = `query StepUpMethods { me { stepUpMethods } }`;

type StepUpMethod = 'password' | 'google' | 'github' | 'email_code';

/** The query params the API's OAuth step-up callback lands the page with (oauthReauth.ts). */
const RETURN_PARAMS = { OK: 'stepUp', ERROR: 'stepUpError' } as const;

interface PendingStepUp {
  methods: StepUpMethod[];
  retry: () => void;
  reject: (err: unknown) => void;
}

/**
 * Which methods to offer. A failed read falls back to the password form,
 * which is what every account was offered before JEF-463; the API still
 * refuses whatever does not fit the account.
 */
async function loadStepUpMethods(): Promise<StepUpMethod[]> {
  try {
    const res = await gqlClient.request<{ me: { stepUpMethods: StepUpMethod[] } | null }>(
      STEP_UP_METHODS,
    );
    const methods = res?.me?.stepUpMethods;
    return methods && methods.length > 0 ? methods : ['password'];
  } catch {
    return ['password'];
  }
}

/** Reads, then removes, the result an OAuth step-up came back with. */
function takeReturnResult(): 'ok' | 'error' | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const result = url.searchParams.has(RETURN_PARAMS.OK)
    ? 'ok'
    : url.searchParams.has(RETURN_PARAMS.ERROR)
      ? 'error'
      : null;
  if (result) {
    url.searchParams.delete(RETURN_PARAMS.OK);
    url.searchParams.delete(RETURN_PARAMS.ERROR);
    window.history.replaceState(window.history.state, '', url.toString());
  }
  return result;
}

/**
 * Wraps a mutation call so a STEP_UP_REQUIRED error — a stale session asking
 * for a sensitive change (JEF-44; every account for deletion, JEF-463) —
 * opens a "confirm it's you" dialog and retries the original call once the
 * user has stepped up, instead of surfacing a raw GraphQL error.
 *
 * The dialog offers what `me.stepUpMethods` says: the password, or for an
 * account without one, Google and a mailed code. Google is a full-page
 * redirect, so that call cannot resume; the hook says on return whether it
 * worked, and the person presses the button again.
 */
export function useStepUpReauth(): {
  withStepUp: <T>(fn: () => Promise<T>) => Promise<T>;
  dialog: React.ReactNode;
} {
  const [pending, setPending] = useState<PendingStepUp | null>(null);
  const [returned, setReturned] = useState<'ok' | 'error' | null>(null);

  useEffect(() => setReturned(takeReturnResult()), []);

  function withStepUp<T>(fn: () => Promise<T>): Promise<T> {
    return fn().catch(async (err: unknown) => {
      if (extractGqlErrorCode(err) !== 'STEP_UP_REQUIRED') throw err;
      const methods = await loadStepUpMethods();
      return new Promise<T>((resolve, reject) => {
        setPending({
          methods,
          retry: () => {
            setPending(null);
            fn().then(resolve, reject);
          },
          reject: (cancelErr) => {
            setPending(null);
            reject(cancelErr);
          },
        });
      });
    });
  }

  const dialog = pending ? (
    <StepUpReauthDialog
      methods={pending.methods}
      onSuccess={pending.retry}
      onCancel={() => pending.reject(new Error(STEP_UP_CANCELLED))}
    />
  ) : returned ? (
    <StepUpReturnNotice result={returned} onClose={() => setReturned(null)} />
  ) : null;

  return { withStepUp, dialog };
}

function StepUpReauthDialog({
  methods,
  onSuccess,
  onCancel,
}: {
  methods: StepUpMethod[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { t } = useLocale();
  const providers = methods.filter((m): m is ReauthProvider => m === 'google');

  return (
    <Modal open onClose={onCancel} size="sm">
      <div className="space-y-4 p-6">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('stepUpReauth.title')}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('stepUpReauth.description')}
          </p>
        </div>
        {methods.includes('password') ? (
          <StepUpPasswordForm onSuccess={onSuccess} onCancel={onCancel} />
        ) : (
          <StepUpWithoutPassword providers={providers} onSuccess={onSuccess} onCancel={onCancel} />
        )}
      </div>
    </Modal>
  );
}

function StepUpReturnNotice({ result, onClose }: { result: 'ok' | 'error'; onClose: () => void }) {
  const { t } = useLocale();
  return (
    <Modal open onClose={onClose} size="sm">
      <div className="space-y-4 p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {t('stepUpReauth.title')}
        </h3>
        {result === 'ok' ? (
          <Alert tone="success">{t('stepUpReauth.returnedOk')}</Alert>
        ) : (
          <Alert>{t('stepUpReauth.returnedError')}</Alert>
        )}
        <div className="flex justify-end">
          <Button onClick={onClose}>{t('stepUpReauth.dismiss')}</Button>
        </div>
      </div>
    </Modal>
  );
}
