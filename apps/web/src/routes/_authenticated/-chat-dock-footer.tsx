import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageCircleIcon, XIcon } from 'lucide-react';
import { useChatDock } from '#/lib/chatDock';
import { useLocale } from '#/lib/i18n';
import { conversationsQueryOptions } from '#/routes/_authenticated/assistant/-shared';
import { ChatDockConversationPicker } from './-chat-dock-picker';

/**
 * Persistent desktop-only footer (JEF-133) present on every authenticated
 * page — the launcher opens the conversation picker, and pinned/minimized
 * conversations show up as a rail of pills the user can reopen or close
 * without leaving the page they're on.
 */
export function ChatDockFooter() {
  const { t } = useLocale();
  const dock = useChatDock();
  const [pickerOpen, setPickerOpen] = useState(false);
  // Titles are only needed for the pills; the picker loads its own list when
  // opened, so an empty dock fetches nothing on first paint (JEF-535).
  const { data } = useQuery({
    ...conversationsQueryOptions,
    enabled: dock.sections.length > 0,
  });
  const titleById = new Map((data?.conversations ?? []).map((c) => [c.id, c.title]));

  const togglePill = (id: string) => {
    if (dock.expanded === id) dock.minimize();
    else dock.openConversation(id);
  };

  return (
    <footer className="fixed right-0 bottom-0 left-60 z-40 hidden h-12 items-center gap-2 border-t border-gray-200 bg-white px-4 lg:flex dark:border-gray-700 dark:bg-gray-800">
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label={t('chatDock.chatWithAssistant')}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <MessageCircleIcon size={16} />
          {t('chatDock.chatWithAssistant')}
        </button>

        {pickerOpen && (
          <>
            {/* Invisible click-outside catcher — the popover itself sits above it (z-50 vs z-40). */}
            <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
            <div className="absolute bottom-full left-0 z-50 mb-2">
              <ChatDockConversationPicker onSelect={() => setPickerOpen(false)} />
            </div>
          </>
        )}
      </div>

      {dock.sections.length > 0 && (
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
          {dock.sections.map((id) => (
            <div
              key={id}
              onClick={() => togglePill(id)}
              className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg py-1.5 pr-1.5 pl-3 text-sm transition-colors ${
                dock.expanded === id
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              <span className="max-w-40 truncate">
                {titleById.get(id) ?? t('assistant.newConversation')}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  dock.closeSection(id);
                }}
                aria-label={t('chatDock.closeConversationAria')}
                className="rounded-sm p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                <XIcon size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </footer>
  );
}
