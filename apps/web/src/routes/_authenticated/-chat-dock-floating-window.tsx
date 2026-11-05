import { useHostedAiAvailable } from '#/lib/aiCredits';
import { AiCreditsMeter } from '#/components/AiCreditsMeter';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronDownIcon, Maximize2Icon, XIcon } from 'lucide-react';
import { IconButton } from '@trakwyn/ui';
import { useChatDock } from '#/lib/chatDock';
import { useLocale } from '#/lib/i18n';
import { conversationsQueryOptions } from '#/routes/_authenticated/assistant/-shared';
import { useChatRunsOn } from '#/routes/_authenticated/assistant/-runsOn';
import { ChatConversationView } from '#/routes/_authenticated/assistant/-components/ChatConversationView';

/**
 * The dock's one expanded floating chat window (JEF-133) — portaled to
 * document.body, same escape-the-sidebar-stacking-context pattern as
 * NotificationInboxPanel. Unlike that panel this isn't a modal: no backdrop,
 * no click-outside/Escape-to-close, since it's meant to sit alongside the
 * page the user is working on rather than block it.
 */
export function ChatDockFloatingWindow() {
  const { t } = useLocale();
  const dock = useChatDock();
  const navigate = useNavigate();

  const { data: conversationsData } = useQuery(conversationsQueryOptions);
  const hostedAi = useHostedAiAvailable();
  const { settings, newConversationProvider } = useChatRunsOn();
  const llmApiKeys = settings?.llmApiKeys ?? [];

  if (!dock.expanded) return null;

  const isNew = dock.expanded === 'new';
  const activeConversation = isNew
    ? undefined
    : conversationsData?.conversations.find((c) => c.id === dock.expanded);
  const title = isNew
    ? t('assistant.newConversation')
    : (activeConversation?.title ?? t('assistant.newConversation'));

  const onMaximize = () => {
    if (isNew) return;
    const conversationId = dock.expanded as string;
    void navigate({ to: '/assistant', search: { conversation: conversationId } });
    dock.closeExpanded();
  };

  return createPortal(
    <div className="fixed right-4 bottom-16 z-50 hidden h-128 w-96 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl lg:flex dark:border-gray-700 dark:bg-gray-800">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-3 py-2.5 dark:border-gray-700">
        <h2 className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h2>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onMaximize}
            disabled={isNew}
            aria-label={t('chatDock.maximizeAria')}
            title={isNew ? t('chatDock.sendMessageFirst') : t('chatDock.openFullPage')}
            className="rounded-sm p-1.5 text-gray-400 transition-colors hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:text-gray-200"
          >
            <Maximize2Icon size={14} />
          </button>
          <IconButton
            label={t('chatDock.minimizeAria')}
            icon={<ChevronDownIcon size={16} />}
            onClick={dock.minimize}
          />
          <IconButton
            label={t('common.close')}
            icon={<XIcon size={14} />}
            variant="danger"
            onClick={dock.closeExpanded}
          />
        </div>
      </div>

      <AiCreditsMeter
        variant="hint"
        className="px-4 pt-2 text-xs text-amber-700 dark:text-amber-400"
      />
      {llmApiKeys.length === 0 && hostedAi === false ? (
        <p className="flex flex-1 items-center justify-center px-4 text-center text-xs text-gray-400 dark:text-gray-500">
          {t('assistant.addApiKeyPrefix')}{' '}
          <Link to="/settings/ai" className="mx-1 underline">
            {t('assistant.settingsLinkText')}
          </Link>{' '}
          {t('assistant.addApiKeySuffix')}
        </p>
      ) : (
        <ChatConversationView
          conversationId={isNew ? null : (dock.expanded as string)}
          provider={newConversationProvider}
          onConversationCreated={(id) => dock.promoteNewConversation(id)}
          compact
        />
      )}
    </div>,
    document.body,
  );
}
