import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ChatDockProvider, useChatDock } from '#/features/chat/lib/chatDock';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <ChatDockProvider>{children}</ChatDockProvider>;
}

describe('useChatDock', () => {
  it('throws when used outside a ChatDockProvider', () => {
    expect(() => renderHook(() => useChatDock())).toThrow(
      'useChatDock must be used within a ChatDockProvider',
    );
  });

  it('starts with no sections and nothing expanded', () => {
    const { result } = renderHook(() => useChatDock(), { wrapper: Wrapper });
    expect(result.current.sections).toEqual([]);
    expect(result.current.expanded).toBeNull();
  });

  it('openNew expands a draft without pinning anything', () => {
    const { result } = renderHook(() => useChatDock(), { wrapper: Wrapper });
    act(() => result.current.openNew());
    expect(result.current.expanded).toBe('new');
    expect(result.current.sections).toEqual([]);
  });

  it('openConversation pins and expands an existing conversation', () => {
    const { result } = renderHook(() => useChatDock(), { wrapper: Wrapper });
    act(() => result.current.openConversation('conv-1'));
    expect(result.current.expanded).toBe('conv-1');
    expect(result.current.sections).toEqual(['conv-1']);
  });

  it('does not duplicate a section already pinned', () => {
    const { result } = renderHook(() => useChatDock(), { wrapper: Wrapper });
    act(() => result.current.openConversation('conv-1'));
    act(() => result.current.openConversation('conv-2'));
    act(() => result.current.openConversation('conv-1'));
    expect(result.current.sections).toEqual(['conv-2', 'conv-1']);
    expect(result.current.expanded).toBe('conv-1');
  });

  it('minimize pins a real expanded conversation and clears expanded', () => {
    const { result } = renderHook(() => useChatDock(), { wrapper: Wrapper });
    act(() => result.current.openConversation('conv-1'));
    act(() => result.current.minimize());
    expect(result.current.expanded).toBeNull();
    expect(result.current.sections).toEqual(['conv-1']);
  });

  it('minimize on a still-empty "new" draft discards it without pinning', () => {
    const { result } = renderHook(() => useChatDock(), { wrapper: Wrapper });
    act(() => result.current.openNew());
    act(() => result.current.minimize());
    expect(result.current.expanded).toBeNull();
    expect(result.current.sections).toEqual([]);
  });

  it('closeExpanded unpins a real expanded conversation', () => {
    const { result } = renderHook(() => useChatDock(), { wrapper: Wrapper });
    act(() => result.current.openConversation('conv-1'));
    act(() => result.current.closeExpanded());
    expect(result.current.expanded).toBeNull();
    expect(result.current.sections).toEqual([]);
  });

  it('closeSection unpins a minimized section without touching a different expanded one', () => {
    const { result } = renderHook(() => useChatDock(), { wrapper: Wrapper });
    act(() => result.current.openConversation('conv-1'));
    act(() => result.current.openConversation('conv-2'));
    act(() => result.current.closeSection('conv-1'));
    expect(result.current.sections).toEqual(['conv-2']);
    expect(result.current.expanded).toBe('conv-2');
  });

  it('closeSection on the currently-expanded section also clears expanded', () => {
    const { result } = renderHook(() => useChatDock(), { wrapper: Wrapper });
    act(() => result.current.openConversation('conv-1'));
    act(() => result.current.closeSection('conv-1'));
    expect(result.current.sections).toEqual([]);
    expect(result.current.expanded).toBeNull();
  });

  it('promoteNewConversation pins the new id and expands it', () => {
    const { result } = renderHook(() => useChatDock(), { wrapper: Wrapper });
    act(() => result.current.openNew());
    act(() => result.current.promoteNewConversation('conv-new'));
    expect(result.current.expanded).toBe('conv-new');
    expect(result.current.sections).toEqual(['conv-new']);
  });

  it('reopening an already-pinned section expands it without reordering the rail', () => {
    const { result } = renderHook(() => useChatDock(), { wrapper: Wrapper });
    act(() => result.current.openConversation('conv-1'));
    act(() => result.current.openConversation('conv-2'));
    act(() => result.current.minimize());
    act(() => result.current.openConversation('conv-1'));
    expect(result.current.expanded).toBe('conv-1');
    expect(result.current.sections).toEqual(['conv-2', 'conv-1']);
  });
});
