import { Trash2Icon, CopyIcon, CheckIcon, PlugIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { Alert, Badge, Button, Card, FormLabel, Input, Select, Skeleton } from '@trakwyn/ui';
import { UpgradePrompt } from '#/components/UpgradePrompt';
import { PLAN_REQUIRED_CODE } from '#/lib/graphqlError';
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
  extractGqlErrorCode,
} from './shared';

/** An inline failure under a form: the upgrade prompt when the action needs Pro, else a plain error. */
function FormMessage({ message, needsPro }: { message: string; needsPro: boolean }) {
  return needsPro ? <UpgradePrompt message={message} /> : <Alert>{message}</Alert>;
}

export function SettingsIntegrationsPage() {
  const { t } = useLocale();
  const qc = useQueryClient();

  // API tokens
  const { data: apiTokensData } = useQuery({
    queryKey: ['apiTokens'],
    queryFn: () => gqlClient.request<{ apiTokens: ApiToken[] }>(API_TOKENS_QUERY),
  });
  const apiTokens = apiTokensData?.apiTokens ?? [];
  const [apiTokenFormOverride, setApiTokenFormOverride] = useState<boolean | null>(null);
  const apiTokenFormOpen = apiTokenFormOverride ?? apiTokens.length === 0;
  const [newApiToken, setNewApiToken] = useState<CreateApiTokenPayload | null>(null);
  const [apiTokenName, setApiTokenName] = useState('');
  // Defaults to read-only: it's what the MCP server needs (POST /mcp accepts
  // either scope), and full read+write access to the GraphQL API should be a
  // deliberate choice rather than what you get by not choosing (JEF-170).
  const [apiTokenScope, setApiTokenScope] = useState<ApiTokenScope>('read');
  const [creatingApiToken, setCreatingApiToken] = useState(false);
  const [apiTokenError, setApiTokenError] = useState<string | null>(null);
  const [apiTokenNeedsPro, setApiTokenNeedsPro] = useState(false);

  const onCreateApiToken = async () => {
    if (!apiTokenName.trim()) return;
    setCreatingApiToken(true);
    setApiTokenError(null);
    setApiTokenNeedsPro(false);
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
      setApiTokenFormOverride(null);
      await qc.invalidateQueries({ queryKey: ['apiTokens'] });
    } catch (err) {
      setApiTokenNeedsPro(extractGqlErrorCode(err) === PLAN_REQUIRED_CODE);
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
      setApiTokenNeedsPro(false);
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
  const [shareLinkFormOverride, setShareLinkFormOverride] = useState<boolean | null>(null);
  const shareLinkFormOpen = shareLinkFormOverride ?? shareLinks.length === 0;
  const [newShareLink, setNewShareLink] = useState<CreateShareLinkPayload | null>(null);
  const [shareLinkName, setShareLinkName] = useState('');
  const [creatingShareLink, setCreatingShareLink] = useState(false);
  const [shareLinkError, setShareLinkError] = useState<string | null>(null);
  const [shareLinkNeedsPro, setShareLinkNeedsPro] = useState(false);

  const shareUrl = (token: string) =>
    `${window.location.origin}/share?token=${encodeURIComponent(token)}`;

  const onCreateShareLink = async () => {
    if (!shareLinkName.trim()) return;
    setCreatingShareLink(true);
    setShareLinkError(null);
    setShareLinkNeedsPro(false);
    try {
      const res = await gqlClient.request<{ createShareLink: CreateShareLinkPayload }>(
        CREATE_SHARE_LINK,
        {
          name: shareLinkName.trim(),
        },
      );
      setNewShareLink(res.createShareLink);
      setShareLinkName('');
      setShareLinkFormOverride(null);
      await qc.invalidateQueries({ queryKey: ['shareLinks'] });
    } catch (err) {
      setShareLinkNeedsPro(extractGqlErrorCode(err) === PLAN_REQUIRED_CODE);
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
      setShareLinkNeedsPro(false);
      setShareLinkError(extractGqlError(err) ?? t('integrations.deleteShareLinkFailed'));
    } finally {
      setDeletingShareLinkId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-900/20">
        <div className="flex items-center gap-3">
          <PlugIcon className="size-4.5 shrink-0 text-blue-700 dark:text-blue-400" />
          <p className="text-sm text-blue-900 dark:text-blue-300">
            {t('guides.aiMcpSetup.bannerIntegrationsText')}
          </p>
        </div>
        <Link
          to="/ai-mcp-setup"
          className="shrink-0 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400"
        >
          {t('guides.aiMcpSetup.bannerLink')}
        </Link>
      </div>

      {/* ── API tokens ── */}
      <Card className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
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
          {!apiTokenFormOpen && !newApiToken && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setApiTokenFormOverride(true)}
              className="shrink-0"
            >
              <span className="flex items-center gap-1.5">
                <PlusIcon size={14} />{' '}
                <span className="hidden sm:inline">{t('integrations.newToken')}</span>
              </span>
            </Button>
          )}
        </div>

        {newApiToken && (
          <div className="space-y-3">
            <p className="text-sm text-green-600">{t('integrations.tokenCreatedNote')}</p>
            <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
              <code className="flex-1 font-mono text-sm break-all text-gray-900 dark:text-gray-100">
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

        {!newApiToken && apiTokenFormOpen && (
          <>
            {apiTokenError && <FormMessage message={apiTokenError} needsPro={apiTokenNeedsPro} />}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
              {apiTokens.length > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setApiTokenFormOverride(false);
                    setApiTokenName('');
                    setApiTokenError(null);
                  }}
                >
                  {t('common.cancel')}
                </Button>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {apiTokenScope === 'read'
                ? t('integrations.scopeReadHelp')
                : t('integrations.scopeFullHelp')}
            </p>
          </>
        )}

        {apiTokens.length > 0 && (
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
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
                  className="flex shrink-0 items-center gap-1 text-xs text-red-600 hover:underline disabled:opacity-60"
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
      </Card>

      {/* ── Connected MCP clients ── */}
      <Card className="space-y-4 p-5">
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
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
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
                  className="flex shrink-0 items-center gap-1 text-xs text-red-600 hover:underline disabled:opacity-60"
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
      </Card>

      {/* ── Share links ── */}
      <Card className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {t('integrations.shareLinksTitle')}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('integrations.shareLinksDescription')}
            </p>
          </div>
          {!shareLinkFormOpen && !newShareLink && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShareLinkFormOverride(true)}
              className="shrink-0"
            >
              <span className="flex items-center gap-1.5">
                <PlusIcon size={14} />{' '}
                <span className="hidden sm:inline">{t('integrations.newShareLink')}</span>
              </span>
            </Button>
          )}
        </div>

        {newShareLink && (
          <div className="space-y-3">
            <p className="text-sm text-green-600">{t('integrations.shareLinkCreatedNote')}</p>
            <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
              <code className="flex-1 font-mono text-sm break-all text-gray-900 dark:text-gray-100">
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

        {!newShareLink && shareLinkFormOpen && (
          <>
            {shareLinkError && (
              <FormMessage message={shareLinkError} needsPro={shareLinkNeedsPro} />
            )}
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
              {shareLinks.length > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShareLinkFormOverride(false);
                    setShareLinkName('');
                    setShareLinkError(null);
                  }}
                >
                  {t('common.cancel')}
                </Button>
              )}
            </div>
          </>
        )}

        {shareLinks.length > 0 && (
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
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
                  className="flex shrink-0 items-center gap-1 text-xs text-red-600 hover:underline disabled:opacity-60"
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
      </Card>
    </div>
  );
}
