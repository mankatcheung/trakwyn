import { lazy, Suspense } from 'react';
import { useChatDock } from '#/lib/chatDock';

const ChatDockFloatingWindow = lazy(() =>
  import('../-chat-dock-floating-window').then((m) => ({ default: m.ChatDockFloatingWindow })),
);

/**
 * The floating window drags the whole chat view (and react-markdown) with it,
 * and nothing shows until a conversation is expanded, so its code loads on the
 * first expand rather than with the shell (JEF-537).
 */
export function LazyChatDockFloatingWindow() {
  const dock = useChatDock();
  if (!dock.expanded) return null;
  return (
    <Suspense fallback={null}>
      <ChatDockFloatingWindow />
    </Suspense>
  );
}
