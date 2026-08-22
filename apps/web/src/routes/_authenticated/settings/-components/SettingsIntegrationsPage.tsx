import { Trash2Icon, CopyIcon, CheckIcon } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { Alert, Badge, Button, FormLabel, Input, Select, Skeleton } from '@trakwyn/ui';
import {
  API_TOKENS_QUERY,
  CREATE_API_TOKEN,
  DELETE_API_TOKEN,
  MCP_OAUTH_GRANTS_QUERY,
  REVOKE_MCP_OAUTH_GRANT,
  SHARE_LINKS_QUERY,
  CREATE_SHARE_LINK,
  DELETE_SHARE_LINK,
  type ApiToken,
  type ApiTokenScope,
  type CreateApiTokenPayload,
  type McpOAuthGrant,
  type ShareLink,
  type CreateShareLinkPayload,
  extractGqlError,
} from './shared';

export function SettingsIntegrationsPage() {
  const { t } = useLocale();
  const qc = useQueryClient();

  // API tokens
  const { data: apiTokensData } = useQuery({
    queryKey: ['apiTokens'],
    queryFn: () => gqlClient.request<{ apiTokens: ApiToken[] }>(API_TOKENS_QUERY),
  });
  const apiTokens = apiTokensData?.apiTokens ?? [];
  const [newApiToken, setNewApiToken] = useState<CreateApiTokenPayload | null>(null);
  const [apiTokenName, setApiTokenName] = useState('');
  // Defaults to read-only: it's what the MCP server needs (POST /mcp accepts
  // either scope), and full read+write access to the GraphQL API should be a
  // deliberate choice rather than what you get by not choosing (JEF-170).
  const [apiTokenScope, setApiTokenScope] = useState<ApiTokenScope>('read');
  const [creatingApiToken, setCreatingApiToken] = useState(false);
  const [apiTokenError, setApiTokenError] = useState<string | null>(null);

  const onCreateApiToken = async () => {
    if (!apiTokenName.trim()) return;
    setCreatingApiToken(true);
    setApiTokenError(null);
    try {
      const res = await gqlClient.request<{ createApiToken: CreateApiTokenPayload }>(
        CREATE_API_TOKEN,
        {
          name: apiTokenName.trim(),
          scope: apiTokenScope,
        },
      );
      setNewApiToken(res.createApiToken);
      setApiTokenName('');
      setApiTokenScope('read');
      await qc.invalidateQueries({ queryKey: ['apiTokens'] });
    } catch (err) {
      setApiTokenError(extractGqlError(err) ?? t('integrations.createTokenFailed'));
    } finally {
      setCreatingApiToken(false);
    }
  };

  const [deletingApiTokenId, setDeletingApiTokenId] = useState<string | null>(null);
  const onDeleteApiToken = async (id: string) => {
    setDeletingApiTokenId(id);
    try {
      await gqlClient.request(DELETE_API_TOKEN, { id });
      await qc.invalidateQueries({ queryKey: ['apiTokens'] });
    } catch (err) {
      setApiTokenError(extractGqlError(err) ?? t('integrations.deleteTokenFailed'));
    } finally {
      setDeletingApiTokenId(null);
    }
  };

  // Share links
  // ── MCP OAuth grants ──
  // Distinct from API tokens above: these were not created here, they were
  // granted to a client through the OAuth consent screen. Revoking is the only
  // action — there is nothing for the user to create.
  const [revokingGrantId, setRevokingGrantId] = useState<string | null>(null);
  const [grantError, setGrantError] = useState<string | null>(null);
  const { data: mcpGrantsData, isLoading: mcpGrantsLoading } = useQuery({
    queryKey: ['mcpOAuthGrants'],
    queryFn: () => gqlClient.request<{ mcpOAuthGrants: McpOAuthGrant[] }>(MCP_OAUTH_GRANTS_QUERY),
  });
  const mcpGrants = mcpGrantsData?.mcpOAuthGrants ?? [];

  const onRevokeGrant = async (id: string) => {
    setRevokingGrantId(id);
    setGrantError(null);
    try {
      await gqlClient.request(REVOKE_MCP_OAUTH_GRANT, { id });
      await qc.invalidateQueries({ queryKey: ['mcpOAuthGrants'] });
    } catch (err) {
      setGrantError(extractGqlError(err));
    } finally {
      setRevokingGrantId(null);
    }
  };

  const { data: shareLinksData } = useQuery({
    queryKey: ['shareLinks'],
    queryFn: () => gqlClient.request<{ shareLinks: ShareLink[] }>(SHARE_LINKS_QUERY),
  });
  const shareLinks = shareLinksData?.shareLinks ?? [];
  const [newShareLink, setNewShareLink] = useState<CreateShareLinkPayload | null>(null);
  const [shareLinkName, setShareLinkName] = useState('');
  const [creatingShareLink, setCreatingShareLink] = useState(false);
  const [shareLinkError, setShareLinkError] = useState<string | null>(null);

  const shareUrl = (token: string) =>
    `${window.location.origin}/share?token=${encodeURIComponent(token)}`;

  const onCreateShareLink = async () => {
    if (!shareLinkName.trim()) return;
    setCreatingShareLink(true);
    setShareLinkError(null);
    try {
      const res = await gqlClient.request<{ createShareLink: CreateShareLinkPayload }>(
        CREATE_SHARE_LINK,
        {
          name: shareLinkName.trim(),
        },
      );
      setNewShareLink(res.createShareLink);
      setShareLinkName('');
      await qc.invalidateQueries({ queryKey: ['shareLinks'] });
    } catch (err) {
      setShareLinkError(extractGqlError(err) ?? t('integrations.createShareLinkFailed'));
    } finally {
      setCreatingShareLink(false);
    }
  };

  const [deletingShareLinkId, setDeletingShareLinkId] = useState<string | null>(null);
  const onDeleteShareLink = async (id: string) => {
    setDeletingShareLinkId(id);
    try {
      await gqlClient.request(DELETE_SHARE_LINK, { id });
      await qc.invalidateQueries({ queryKey: ['shareLinks'] });
    } catch (err) {
      setShareLinkError(extractGqlError(err) ?? t('integrations.deleteShareLinkFailed'));
    } finally {
      setDeletingShareLinkId(null);
    }
  };

  return (
    <div className="space-y-10">
      {/* ── API tokens ── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('integrations.apiTokensTitle')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('integrations.apiTokensDescription')}
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('integrations.mcpHint')}{' '}
            <a
              href="https://github.com/mankatcheung/trakwyn#mcp-server"
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline"
            >
              {t('integrations.mcpHintLink')}
            </a>
          </p>
        </div>

        {newApiToken && (
          <div className="space-y-3">
            <p className="text-sm text-green-600">{t('integrations.tokenCreatedNote')}</p>
            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <code className="flex-1 text-sm font-mono text-gray-900 dark:text-gray-100 break-all">
                {newApiToken.token}
              </code>
              <Button
                variant="link"
                onClick={() => {
                  navigator.clipboard.writeText(newApiToken.token);
                }}
                aria-label={t('integrations.copyTokenAria')}
                className="shrink-0"
              >
                <span className="flex items-center gap-1">
                  <CopyIcon size={14} />{' '}
                  <span className="hidden sm:inline">{t('common.copy')}</span>
                </span>
              </Button>
            </div>
            <Button onClick={() => setNewApiToken(null)} aria-label={t('common.done')}>
              <span className="flex items-center gap-1.5">
                <CheckIcon size={14} /> <span className="hidden sm:inline">{t('common.done')}</span>
              </span>
            </Button>
          </div>
        )}

        {!newApiToken && (
          <>
            {apiTokenError && <Alert>{apiTokenError}</Alert>}
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <FormLabel>{t('integrations.tokenNameLabel')}</FormLabel>
                <Input
                  type="text"
                  value={apiTokenName}
                  onChange={(e) => setApiTokenName(e.target.value)}
                  placeholder="e.g. CI pipeline"
                />
              </div>
              <div className="sm:w-56">
                <FormLabel>{t('integrations.tokenScopeLabel')}</FormLabel>
                <Select
                  value={apiTokenScope}
                  onChange={(e) => setApiTokenScope(e.target.value as ApiTokenScope)}
                  aria-label={t('integrations.tokenScopeLabel')}
                >
                  <option value="read">{t('integrations.scopeRead')}</option>
                  <option value="full">{t('integrations.scopeFull')}</option>
                </Select>
              </div>
              <Button
                onClick={onCreateApiToken}
                disabled={creatingApiToken || !apiTokenName.trim()}
              >
                {creatingApiToken ? t('integrations.creating') : t('integrations.createToken')}
              </Button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {apiTokenScope === 'read'
                ? t('integrations.scopeReadHelp')
                : t('integrations.scopeFullHelp')}
            </p>
          </>
        )}

        {apiTokens.length > 0 && (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-700">
            {apiTokens.map((token) => (
              <li key={token.id} className="flex items-center justify-between gap-4 px-3 py-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                    <span className="truncate">{token.name}</span>
                    <Badge tone={token.scope === 'read' ? 'gray' : 'yellow'}>
                      {token.scope === 'read'
                        ? t('integrations.scopeRead')
                        : t('integrations.scopeFull')}
                    </Badge>
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('integrations.createdOn', {
                      date: new Date(token.createdAt).toLocaleDateString(),
                    })}
                    {token.lastUsedAt &&
                      ` · ${t('integrations.lastUsedSuffix', { date: new Date(token.lastUsedAt).toLocaleDateString() })}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteApiToken(token.id)}
                  disabled={deletingApiTokenId === token.id}
                  aria-label={t('integrations.revokeTokenAria')}
                  className="shrink-0 flex items-center gap-1 text-xs text-red-600 hover:underline disabled:opacity-60"
                >
                  <Trash2Icon size={14} />{' '}
                  <span className="hidden sm:inline">
                    {deletingApiTokenId === token.id
                      ? t('integrations.deleting')
                      : t('integrations.revoke')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* ── Connected MCP clients ── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('integrations.mcpGrantsTitle')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('integrations.mcpGrantsDescription')}
          </p>
        </div>

        {grantError && <Alert>{grantError}</Alert>}

        {mcpGrantsLoading ? (
          <Skeleton className="h-16 rounded-lg" />
        ) : mcpGrants.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('integrations.mcpGrantsEmpty')}
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-700">
            {mcpGrants.map((grant) => (
              <li key={grant.id} className="flex items-center justify-between gap-4 px-3 py-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                    <span className="truncate">{grant.clientName}</span>
                    <Badge tone={grant.scope === 'read' ? 'gray' : 'yellow'}>
                      {grant.scope === 'read'
                        ? t('integrations.scopeRead')
                        : t('integrations.scopeFull')}
                    </Badge>
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('integrations.mcpGrantAuthorizedOn', {
                      date: new Date(grant.authorizedAt).toLocaleDateString(),
                    })}
                    {grant.lastUsedAt &&
                      ` · ${t('integrations.lastUsedSuffix', { date: new Date(grant.lastUsedAt).toLocaleDateString() })}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRevokeGrant(grant.id)}
                  disabled={revokingGrantId === grant.id}
                  aria-label={t('integrations.mcpGrantRevokeAria', { name: grant.clientName })}
                  className="shrink-0 flex items-center gap-1 text-xs text-red-600 hover:underline disabled:opacity-60"
                >
                  <Trash2Icon size={14} />{' '}
                  <span className="hidden sm:inline">
                    {revokingGrantId === grant.id
                      ? t('integrations.deleting')
                      : t('integrations.revoke')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* ── Share links ── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('integrations.shareLinksTitle')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('integrations.shareLinksDescription')}
          </p>
        </div>

        {newShareLink && (
          <div className="space-y-3">
            <p className="text-sm text-green-600">{t('integrations.shareLinkCreatedNote')}</p>
            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <code className="flex-1 text-sm font-mono text-gray-900 dark:text-gray-100 break-all">
                {shareUrl(newShareLink.token)}
              </code>
              <Button
                variant="link"
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl(newShareLink.token));
                }}
                aria-label={t('integrations.copyLinkAria')}
                className="shrink-0"
              >
                <span className="flex items-center gap-1">
                  <CopyIcon size={14} />{' '}
                  <span className="hidden sm:inline">{t('common.copy')}</span>
                </span>
              </Button>
            </div>
            <Button onClick={() => setNewShareLink(null)} aria-label={t('common.done')}>
              <span className="flex items-center gap-1.5">
                <CheckIcon size={14} /> <span className="hidden sm:inline">{t('common.done')}</span>
              </span>
            </Button>
          </div>
        )}

        {!newShareLink && (
          <>
            {shareLinkError && <Alert>{shareLinkError}</Alert>}
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <FormLabel>{t('integrations.linkNameLabel')}</FormLabel>
                <Input
                  type="text"
                  value={shareLinkName}
                  onChange={(e) => setShareLinkName(e.target.value)}
                  placeholder="e.g. For my mentor"
                />
              </div>
              <Button
                onClick={onCreateShareLink}
                disabled={creatingShareLink || !shareLinkName.trim()}
              >
                {creatingShareLink ? t('integrations.creating') : t('integrations.createLink')}
              </Button>
            </div>
          </>
        )}

        {shareLinks.length > 0 && (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-700">
            {shareLinks.map((link) => (
              <li key={link.id} className="flex items-center justify-between gap-4 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {link.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('integrations.createdOn', {
                      date: new Date(link.createdAt).toLocaleDateString(),
                    })}
                    {link.lastUsedAt &&
                      ` · ${t('integrations.lastViewedSuffix', { date: new Date(link.lastUsedAt).toLocaleDateString() })}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteShareLink(link.id)}
                  disabled={deletingShareLinkId === link.id}
                  aria-label={t('integrations.revokeShareLinkAria')}
                  className="shrink-0 flex items-center gap-1 text-xs text-red-600 hover:underline disabled:opacity-60"
                >
                  <Trash2Icon size={14} />{' '}
                  <span className="hidden sm:inline">
                    {deletingShareLinkId === link.id
                      ? t('integrations.deleting')
                      : t('integrations.revoke')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
