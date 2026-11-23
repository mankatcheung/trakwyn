import { useActionState, useEffect, useState } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { API_ORIGIN } from '#/lib/apiOrigin';
import { useLocale } from '#/lib/i18n';
import { SubmitButton } from '@trakwyn/ui';

export function McpAuthorizePage() {
  const { t } = useLocale();
  const search = useSearch({ from: '/oauth/authorize' });
  const [clientName, setClientName] = useState<string | null>(null);
  // Issued by the GET below and required by the POST: it is what proves to the
  // API that this decision came from a consent screen the user was shown.
  const [consentToken, setConsentToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(search);
    fetch(`${API_ORIGIN}/oauth/authorize/approve?${query.toString()}`, {
      credentials: 'include',
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          client_name?: string;
          consent_token?: string;
          error?: string;
        };
        if (response.status === 401) {
          setError('Sign in to Trakwyn before authorizing this MCP client.');
          return;
        }
        if (!response.ok || !body.client_name || !body.consent_token) {
          setError(body.error ?? 'This authorization request is invalid.');
          return;
        }
        setClientName(body.client_name);
        setConsentToken(body.consent_token);
      })
      .catch(() => setError('Unable to load the authorization request.'));
  }, [search]);

  // Allow and Deny are the form's two submitters; the one pressed arrives in
  // the FormData as `decision`. A pending form here means "waiting for the API".
  const [submitError, submit] = useActionState(
    async (_previous: string | null, formData: FormData): Promise<string | null> => {
      if (!consentToken) return null;
      const approved = formData.get('decision') === 'approve';
      try {
        const response = await fetch(`${API_ORIGIN}/oauth/authorize/approve`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...search, approved, consent_token: consentToken }),
        });
        const body = (await response.json()) as { redirect_to?: string; error?: string };
        if (!response.ok || !body.redirect_to) {
          return body.error ?? 'Unable to complete authorization.';
        }
        window.location.assign(body.redirect_to);
        return null;
      } catch {
        return 'Unable to complete authorization.';
      }
    },
    null,
  );
  const shownError = error ?? submitError;

  const loginReturnTo = `/oauth/authorize?${new URLSearchParams(search).toString()}`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4 dark:bg-stone-900">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-sm dark:bg-stone-800">
        <h1 className="text-2xl font-medium text-stone-900 dark:text-stone-100">
          {t('mcp.authorizeTitle')}
        </h1>
        {shownError ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-red-600">{shownError}</p>
            {shownError.startsWith('Sign in') && (
              <Link
                to="/login"
                search={{ returnTo: loginReturnTo }}
                className="text-sm text-blue-800 dark:text-blue-400 underline"
              >
                {t('auth.signIn', { defaultValue: 'Sign in' })}
              </Link>
            )}
          </div>
        ) : clientName ? (
          <div className="mt-5 space-y-5">
            <p className="text-sm text-stone-600 dark:text-stone-300">
              <strong>{clientName}</strong> {t('mcp.authorizationRequest')}
            </p>
            <p className="text-sm text-stone-600 dark:text-stone-300">
              {t('mcp.requestedScope')} <strong>{search.scope}</strong>
            </p>
            <form action={submit} className="flex gap-3">
              <SubmitButton name="decision" value="deny" variant="secondary">
                {t('common.cancel', { defaultValue: 'Deny' })}
              </SubmitButton>
              <SubmitButton name="decision" value="approve">
                {t('mcp.allowAccess')}
              </SubmitButton>
            </form>
          </div>
        ) : (
          <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">
            {t('common.loading', { defaultValue: 'Loading authorization request...' })}
          </p>
        )}
      </div>
    </main>
  );
}
