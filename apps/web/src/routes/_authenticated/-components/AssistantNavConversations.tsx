import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { MessageCircleIcon, PlusIcon } from 'lucide-react';
import { useLocale } from '#/lib/i18n';
import { recentConversationsQueryOptions } from '#/routes/_authenticated/assistant/-shared';

export interface AssistantNavConversationsProps {
  /** Conversation currently open in the chat pane, if any. */
  activeId?: string;
  /**
   * Called after a pick so containers can react — the mobile drawer closes
   * itself this way, since switching conversations only swaps a search param
   * and never changes the pathname its close-on-route-change effect watches.
   */
  onNavigate?: () => void;
}

/**
 * The recent-conversations subitems nested under "Assistant" in the app
 * sidebar (JEF-229) — same relationship Settings has to its own tabs.
 * Bounded server-side to the ten most recent threads; full history lives
 * behind the "All chats" entry at the bottom.
 */
export function AssistantNavConversations({
  activeId,
  onNavigate,
}: AssistantNavConversationsProps) {
  const { t } = useLocale();
  const { data } = useQuery(recentConversationsQueryOptions());
  const conversations = data?.conversations ?? [];

  return (
    <div className="my-1 ml-2 space-y-0.5 border-l border-gray-200 dark:border-gray-700">
      {/* First among the subitems: an empty search param clears the active
          conversation, which is exactly what "new" means here. */}
      <Link
        to="/assistant"
        search={{}}
        onClick={onNavigate}
        className="sidebar-nav-item flex items-center gap-2 rounded-r-lg py-1.5 pr-3 pl-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
      >
        <PlusIcon size={14} />
        {t('assistant.newConversation')}
      </Link>
      {conversations.map((c) => {
        const isActive = c.id === activeId;
        return (
          <Link
            key={c.id}
            to="/assistant"
            search={{ conversation: c.id }}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            title={c.title ?? t('assistant.newConversation')}
            className={`sidebar-nav-item block truncate rounded-r-lg py-1.5 pr-3 pl-4 text-sm transition-colors ${
              isActive
                ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
            }`}
          >
            {c.title ?? t('assistant.newConversation')}
          </Link>
        );
      })}
      <Link
        to="/assistant/history"
        onClick={onNavigate}
        className="sidebar-nav-item flex items-center gap-2 rounded-r-lg py-1.5 pr-3 pl-4 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
      >
        <MessageCircleIcon size={14} />
        {t('assistant.allChats')}
      </Link>
    </div>
  );
}
