import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import type { SlashCommandItem } from './slashCommands';

/** What the popup needs to draw itself. `null` means the menu is closed. */
export interface SlashMenuState {
  query: string;
  items: SlashCommandItem[];
  selectedIndex: number;
  /** Inserts the block and removes the typed `/query`. */
  command: (item: SlashCommandItem) => void;
  clientRect: (() => DOMRect | null) | null;
}

/**
 * The bridge between Tiptap's Suggestion plugin and the React popup: the plugin
 * calls `render()`'s handlers, the popup reads `getState()` through
 * `useSyncExternalStore`. Kept as plain data so the keyboard rules are testable.
 */
export function createSlashMenuController() {
  let state: SlashMenuState | null = null;
  const listeners = new Set<() => void>();

  const set = (next: SlashMenuState | null) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  const fromProps = (
    props: SuggestionProps<SlashCommandItem, SlashCommandItem>,
    selectedIndex: number,
  ): SlashMenuState => ({
    query: props.query,
    items: props.items,
    selectedIndex: Math.min(selectedIndex, Math.max(props.items.length - 1, 0)),
    command: props.command,
    clientRect: props.clientRect ?? null,
  });

  const move = (step: 1 | -1) => {
    if (!state) return;
    const count = state.items.length;
    set({ ...state, selectedIndex: (state.selectedIndex + step + count) % count });
  };

  return {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Pointer hover moves the highlight like the arrow keys do. */
    select: (index: number) => {
      if (state && index !== state.selectedIndex) set({ ...state, selectedIndex: index });
    },
    /** The `render` option of the Suggestion plugin. */
    render: () => ({
      onStart: (props: SuggestionProps<SlashCommandItem, SlashCommandItem>) =>
        set(fromProps(props, 0)),
      onUpdate: (props: SuggestionProps<SlashCommandItem, SlashCommandItem>) =>
        // A new query starts again from the best match; other updates keep the highlight.
        set(fromProps(props, state?.query === props.query ? (state?.selectedIndex ?? 0) : 0)),
      onExit: () => set(null),
      onKeyDown: ({ event }: SuggestionKeyDownProps): boolean => {
        // With nothing to pick, keys keep their normal meaning (Enter starts a new line).
        if (!state || state.items.length === 0) return false;
        if (event.key === 'ArrowDown') {
          move(1);
          return true;
        }
        if (event.key === 'ArrowUp') {
          move(-1);
          return true;
        }
        if (event.key === 'Enter') {
          state.command(state.items[state.selectedIndex]);
          return true;
        }
        return false;
      },
    }),
  };
}

export type SlashMenuController = ReturnType<typeof createSlashMenuController>;
