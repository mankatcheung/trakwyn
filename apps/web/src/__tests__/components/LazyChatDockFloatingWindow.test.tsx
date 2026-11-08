import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { mockDock, mockLoaded } = vi.hoisted(() => ({
  mockDock: { expanded: null as string | 'new' | null },
  mockLoaded: vi.fn(),
}));

vi.mock('#/lib/chatDock', () => ({ useChatDock: () => mockDock }));
vi.mock('#/routes/_authenticated/-chat-dock-floating-window', () => {
  mockLoaded();
  return { ChatDockFloatingWindow: () => <div data-testid="floating-window" /> };
});

import { LazyChatDockFloatingWindow } from '#/routes/_authenticated/-components/LazyChatDockFloatingWindow';

describe('LazyChatDockFloatingWindow', () => {
  beforeEach(() => {
    mockDock.expanded = null;
  });

  it('does not load or render the window while nothing is expanded', () => {
    render(<LazyChatDockFloatingWindow />);
    expect(screen.queryByTestId('floating-window')).not.toBeInTheDocument();
    expect(mockLoaded).not.toHaveBeenCalled();
  });

  it('loads and renders the window once a conversation is expanded', async () => {
    mockDock.expanded = 'conv-1';
    render(<LazyChatDockFloatingWindow />);
    expect(await screen.findByTestId('floating-window')).toBeInTheDocument();
    expect(mockLoaded).toHaveBeenCalledTimes(1);
  });
});
