import { Trash2Icon, CopyIcon, CheckIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { Alert, Button, Card, FormLabel, Input } from '@trakwyn/ui';
import { UpgradePrompt } from '#/features/plans/components/UpgradePrompt';
import { QuotaHint } from '#/features/quota/components/QuotaHint';
import { useQuotaState } from '#/features/quota/lib/contentQuota';
import { PLAN_REQUIRED_CODE } from '#/lib/graphqlError';
import {
  SHARE_LINKS_QUERY,
  CREATE_SHARE_LINK,
  DELETE_SHARE_LINK,
} from '../../graphql/integrationsQueries';
import { extractGqlError, extractGqlErrorCode } from '../../lib/gqlErrors';
import type { ShareLink, CreateShareLinkPayload } from '../../lib/integrations/integrationTypes';

/** An inline failure under a form: the upgrade prompt when the action needs Pro, else a plain error. */
function FormMessage({ message, needsPro }: { message: string; needsPro: boolean }) {
  return needsPro ? <UpgradePrompt message={message} /> : <Alert>{message}</Alert>;
}

export function ShareLinksCard() {
  const { t } = useLocale();
  const qc = useQueryClient();

  const { data: shareLinksData } = useQuery({
    queryKey: ['shareLinks'],
    queryFn: () => gqlClient.request(SHARE_LINKS_QUERY) as Promise<{ shareLinks: ShareLink[] }>,
  });
  const shareLinks = shareLinksData?.shareLinks ?? [];
  const shareLinksFull = useQuotaState('shareLinks', shareLinks.length)?.level === 'full';
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
      const res = (await gqlClient.request(CREATE_SHARE_LINK, {
        name: shareLinkName.trim(),
      })) as { createShareLink: CreateShareLinkPayload };
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
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-medium text-stone-900 dark:text-stone-100">
            {t('integrations.shareLinksTitle')}
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {t('integrations.shareLinksDescription')}
          </p>
          <QuotaHint resource="shareLinks" used={shareLinks.length} className="mt-1" />
        </div>
        {!shareLinkFormOpen && !newShareLink && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setShareLinkFormOverride(true)}
            disabled={shareLinksFull}
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
          <div className="flex items-center gap-2 rounded-lg bg-stone-50 p-3 dark:bg-stone-800">
            <code className="flex-1 font-mono text-sm break-all text-stone-900 dark:text-stone-100">
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
                <CopyIcon size={14} /> <span className="hidden sm:inline">{t('common.copy')}</span>
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
          {shareLinkError && <FormMessage message={shareLinkError} needsPro={shareLinkNeedsPro} />}
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
              disabled={creatingShareLink || !shareLinkName.trim() || shareLinksFull}
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
        <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200 dark:divide-stone-700 dark:border-stone-700">
          {shareLinks.map((link) => (
            <li key={link.id} className="flex items-center justify-between gap-4 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                  {link.name}
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400">
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
  );
}
