import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { ANALYTICS_EVENTS, captureEvent } from '#/lib/analytics';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import {
  CONFIRM_CHAT_ACTION,
  DISMISS_CHAT_ACTION,
  chatHistoryQueryOptions,
  type ChatProposal,
} from '#/routes/_authenticated/assistant/-shared';

interface ChatProposalCardProps {
  proposal: ChatProposal;
  conversationId: string;
}

/**
 * A write the assistant proposed (JEF-469): nothing has changed until Confirm.
 * Pending cards carry the buttons; resolved ones (also when the conversation is
 * reopened) show how it ended. Confirm sends only the id; the server applies
 * the arguments it saved.
 */
export function ChatProposalCard({ proposal, conversationId }: ChatProposalCardProps) {
  const { t } = useLocale();
  const qc = useQueryClient();

  const refreshHistory = () =>
    qc.invalidateQueries({ queryKey: chatHistoryQueryOptions(conversationId).queryKey });

  const confirm = useMutation({
    mutationFn: () => gqlClient.request(CONFIRM_CHAT_ACTION, { id: proposal.id }),
    onSuccess: async () => {
      captureEvent(ANALYTICS_EVENTS.ASSISTANT_CHANGE_CONFIRMED, { tool: proposal.toolName });
      // The write could touch any list in the app (applications, notes, the
      // profile), so every cached query is marked stale and the ones on screen refetch.
      await qc.invalidateQueries();
    },
    // A refusal (PLAN_REQUIRED, expired) is recorded on the proposal, so the
    // refetched card shows it rather than a live button.
    onError: () => void refreshHistory(),
  });

  const dismiss = useMutation({
    mutationFn: () => gqlClient.request(DISMISS_CHAT_ACTION, { id: proposal.id }),
    onSuccess: async () => {
      captureEvent(ANALYTICS_EVENTS.ASSISTANT_CHANGE_DISMISSED, { tool: proposal.toolName });
      await refreshHistory();
    },
    onError: () => void refreshHistory(),
  });

  const busy = confirm.isPending || dismiss.isPending;
  const error = confirm.error ?? dismiss.error;

  return (
    <div
      data-testid="chat-proposal"
      className="max-w-[80%] rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm dark:border-blue-900 dark:bg-blue-950/40"
    >
      <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
        {t('chat.proposal.heading')}
      </p>
      <p className="mt-1 text-gray-800 dark:text-gray-200">{proposal.summary}</p>

      {proposal.status === 'pending' ? (
        <div className="mt-3 flex gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => confirm.mutate()}>
            {t('chat.proposal.confirm')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => dismiss.mutate()}
          >
            {t('chat.proposal.dismiss')}
          </Button>
        </div>
      ) : (
        <p
          className={`mt-2 text-xs ${
            proposal.status === 'failed' || proposal.status === 'expired'
              ? 'text-red-600 dark:text-red-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {t(`chat.proposal.${proposal.status}`)}
          {proposal.status === 'failed' && proposal.error ? `: ${proposal.error}` : ''}
        </p>
      )}

      {error && proposal.status === 'pending' && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">
          {getErrorMessage(error) || t('chat.proposal.error')}
        </p>
      )}
    </div>
  );
}
