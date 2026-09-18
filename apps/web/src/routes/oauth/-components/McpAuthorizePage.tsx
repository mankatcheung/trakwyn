import { useEffect, useState } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { API_ORIGIN } from '#/lib/apiOrigin';
import { useLocale } from '#/lib/i18n';
import { Button } from '@trakwyn/ui';

export function McpAuthorizePage() {
  const { t } = useLocale();
  const search = useSearch({ from: '/oauth/authorize' });
  const [clientName, setClientName] = useState<string | null>(null);
  // Issued by the GET below and required by the POST: it is what proves to the
  // API that this decision came from a consent screen the user was shown.
  const [consentToken, setConsentToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const submit = async (approved: boolean) => {
    if (!consentToken) return;
    setSubmitting(true);
    try {
      const response = await fetch(`${API_ORIGIN}/oauth/authorize/approve`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...search, approved, consent_token: consentToken }),
      });
      const body = (await response.json()) as { redirect_to?: string; error?: string };
      if (!response.ok || !body.redirect_to) {
        setError(body.error ?? 'Unable to complete authorization.');
        return;
      }
      window.location.assign(body.redirect_to);
    } catch {
      setError('Unable to complete authorization.');
    } finally {
      setSubmitting(false);
    }
  };

  const loginReturnTo = `/oauth/authorize?${new URLSearchParams(search).toString()}`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-sm dark:bg-gray-800">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('mcp.authorizeTitle')}
        </h1>
        {error ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-red-600">{error}</p>
            {error.startsWith('Sign in') && (
              <Link
                to="/login"
                search={{ returnTo: loginReturnTo }}
                className="text-sm text-blue-600 underline"
              >
                {t('auth.signIn', { defaultValue: 'Sign in' })}
              </Link>
            )}
          </div>
        ) : clientName ? (
          <div className="mt-5 space-y-5">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              <strong>{clientName}</strong> {t('mcp.authorizationRequest')}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {t('mcp.requestedScope')} <strong>{search.scope}</strong>
            </p>
            <div className="flex gap-3">
              <Button onClick={() => submit(false)} disabled={submitting} variant="secondary">
                {t('common.cancel', { defaultValue: 'Deny' })}
              </Button>
              <Button onClick={() => submit(true)} disabled={submitting}>
                {t('mcp.allowAccess')}
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            {t('common.loading', { defaultValue: 'Loading authorization request...' })}
          </p>
        )}
      </div>
    </main>
  );
}
