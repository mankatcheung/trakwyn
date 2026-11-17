/* eslint-disable react-refresh/only-export-components -- ChatDockProvider and useChatDock share one context; keeping them together keeps the context private. */
import { createContext, use, useState } from 'react';

/**
 * Global UI state for the desktop chat dock (JEF-133) — which conversations
 * are pinned to the footer and which one (if any) is currently shown as the
 * floating widget. Deliberately holds only ids, not conversation data:
 * titles/messages stay in TanStack Query's cache (`conversationsQueryOptions`
 * / `chatHistoryQueryOptions`), looked up by id wherever they're rendered, so
 * this state can't drift out of sync with the real data.
 *
 * v1 is in-memory only (no localStorage/sessionStorage persistence) — a page
 * reload loses the pinned/expanded state, which is fine since the underlying
 * conversations are safely persisted server-side regardless; reopening one
 * via /assistant/history is a one-click fallback.
 */
interface ChatDockContextValue {
  /** Pinned conversation ids, most-recently-opened first. Includes the expanded one, if any. */
  sections: string[];
  /** The section currently shown as the floating window: a real conversation id, 'new' for a not-yet-created conversation, or null if nothing is expanded. */
  expanded: string | 'new' | null;
  /** Expands a brand-new, not-yet-created conversation. Not pinned until it's actually sent to (see promoteNewConversation). */
  openNew: () => void;
  /** Expands an existing conversation, pinning it if it isn't already. */
  openConversation: (conversationId: string) => void;
  /** Collapses the expanded window back to a footer pill. Pins it first if it's a real id not already pinned; a still-empty 'new' draft is simply discarded. */
  minimize: () => void;
  /** Collapses AND unpins the expanded window — for 'new' this just discards the empty draft (nothing was pinned yet). */
  closeExpanded: () => void;
  /** Unpins a minimized section directly (e.g. its own × in the footer rail), without needing to expand it first. */
  closeSection: (conversationId: string) => void;
  /** Called once a conversation started via openNew() gets its real id from the first send — pins it and switches `expanded` from 'new' to that id. */
  promoteNewConversation: (conversationId: string) => void;
}

const ChatDockContext = createContext<ChatDockContextValue | null>(null);

export function ChatDockProvider({ children }: { children: React.ReactNode }) {
  const [sections, setSections] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | 'new' | null>(null);

  const pin = (conversationId: string) => {
    setSections((prev) => (prev.includes(conversationId) ? prev : [conversationId, ...prev]));
  };

  const openNew = () => setExpanded('new');

  const openConversation = (conversationId: string) => {
    pin(conversationId);
    setExpanded(conversationId);
  };

  const minimize = () => {
    if (expanded && expanded !== 'new') pin(expanded);
    setExpanded(null);
  };

  const closeExpanded = () => {
    if (expanded && expanded !== 'new') {
      setSections((prev) => prev.filter((id) => id !== expanded));
    }
    setExpanded(null);
  };

  const closeSection = (conversationId: string) => {
    setSections((prev) => prev.filter((id) => id !== conversationId));
    setExpanded((prev) => (prev === conversationId ? null : prev));
  };

  const promoteNewConversation = (conversationId: string) => {
    pin(conversationId);
    setExpanded(conversationId);
  };

  return (
    <ChatDockContext
      value={{
        sections,
        expanded,
        openNew,
        openConversation,
        minimize,
        closeExpanded,
        closeSection,
        promoteNewConversation,
      }}
    >
      {children}
    </ChatDockContext>
  );
}

export function useChatDock(): ChatDockContextValue {
  const ctx = use(ChatDockContext);
  if (!ctx) throw new Error('useChatDock must be used within a ChatDockProvider');
  return ctx;
}
