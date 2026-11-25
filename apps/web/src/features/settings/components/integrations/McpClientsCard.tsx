import { Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { useDates } from '#/hooks/useDates';
import { Alert, Badge, Card, Skeleton } from '@trakwyn/ui';
import { MCP_OAUTH_GRANTS_QUERY, REVOKE_MCP_OAUTH_GRANT } from '../../graphql/integrationsQueries';
import { extractGqlError } from '../../lib/gqlErrors';
import type { McpOAuthGrant } from '../../lib/integrations/integrationTypes';

/**
 * Distinct from the API tokens card: these were not created here, they were
 * granted to a client through the OAuth consent screen. Revoking is the only
 * action — there is nothing for the user to create.
 */
export function McpClientsCard() {
  const { t } = useLocale();
  const dates = useDates();
  const qc = useQueryClient();

  const [revokingGrantId, setRevokingGrantId] = useState<string | null>(null);
  const [grantError, setGrantError] = useState<string | null>(null);
  const { data: mcpGrantsData, isLoading: mcpGrantsLoading } = useQuery({
    queryKey: ['mcpOAuthGrants'],
    queryFn: () =>
      gqlClient.request(MCP_OAUTH_GRANTS_QUERY) as Promise<{ mcpOAuthGrants: McpOAuthGrant[] }>,
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

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-base font-medium text-stone-900 dark:text-stone-100">
          {t('integrations.mcpGrantsTitle')}
        </h2>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {t('integrations.mcpGrantsDescription')}
        </p>
      </div>

      {grantError && <Alert>{grantError}</Alert>}

      {mcpGrantsLoading ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : mcpGrants.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {t('integrations.mcpGrantsEmpty')}
        </p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200 dark:divide-stone-700 dark:border-stone-700">
          {mcpGrants.map((grant) => (
            <li key={grant.id} className="flex items-center justify-between gap-4 px-3 py-2">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-stone-900 dark:text-stone-100">
                  <span className="truncate">{grant.clientName}</span>
                  <Badge tone={grant.scope === 'read' ? 'gray' : 'yellow'}>
                    {grant.scope === 'read'
                      ? t('integrations.scopeRead')
                      : t('integrations.scopeFull')}
                  </Badge>
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  {t('integrations.mcpGrantAuthorizedOn', {
                    date: dates.day(grant.authorizedAt),
                  })}
                  {grant.lastUsedAt &&
                    ` · ${t('integrations.lastUsedSuffix', { date: dates.day(grant.lastUsedAt) })}`}
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
  );
}
