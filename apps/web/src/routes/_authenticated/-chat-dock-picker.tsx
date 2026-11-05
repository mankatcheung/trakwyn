import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useChatDock } from '#/lib/chatDock';
import { useLocale } from '#/lib/i18n';
import { conversationsQueryOptions, timeAgo } from '#/routes/_authenticated/assistant/-shared';
import { useChatRunsOn } from '#/routes/_authenticated/assistant/-runsOn';

const RECENT_LIMIT = 6;

/**
 * The chat dock launcher's popover — "New conversation" plus a short list of
 * recent conversations to reopen. Visual template borrowed from
 * ConversationHistoryPage's row styling, compacted for a footer popover.
 */
export function ChatDockConversationPicker({ onSelect }: { onSelect: () => void }) {
  const { t } = useLocale();
  const dock = useChatDock();
  const { data } = useQuery(conversationsQueryOptions);
  const { runsOnFor, label } = useChatRunsOn();
  const conversations = (data?.conversations ?? []).slice(0, RECENT_LIMIT);

  return (
    <div className="w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
      <button
        type="button"
        onClick={() => {
          dock.openNew();
          onSelect();
        }}
        className="flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2.5 text-sm text-blue-600 transition-colors hover:bg-blue-50 dark:border-gray-700 dark:text-blue-400 dark:hover:bg-blue-900/20"
      >
        <PlusIcon size={15} />
        {t('assistant.newConversation')}
      </button>

      {conversations.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-gray-400 dark:text-gray-500">
          {t('conversationHistory.noConversationsYet')}
        </p>
      ) : (
        <ul className="max-h-72 overflow-y-auto">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  dock.openConversation(c.id);
                  onSelect();
                }}
                className="w-full border-b border-gray-50 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-gray-50 dark:border-gray-700/50 dark:hover:bg-gray-700"
              >
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {c.title ?? t('assistant.newConversation')}
                </p>
                <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                  {timeAgo(c.updatedAt, t)}
                  {label(runsOnFor(c)) ? ` · ${label(runsOnFor(c))}` : ''}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
