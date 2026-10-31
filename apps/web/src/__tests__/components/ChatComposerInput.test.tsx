import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { ChatComposerInput } from '#/routes/_authenticated/assistant/-components/ChatComposerInput';
import { CHAT_INPUT_MAX_LINES } from '#/constants';

function Harness({ onSubmit }: { onSubmit: () => void }) {
  const [value, setValue] = useState('');
  return (
    <ChatComposerInput
      value={value}
      onChange={setValue}
      onSubmit={onSubmit}
      placeholder="Ask a question…"
      maxLength={50}
    />
  );
}

const box = () => screen.getByPlaceholderText('Ask a question…') as HTMLTextAreaElement;

describe('ChatComposerInput (JEF-481)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is a multi-line textarea that keeps newlines', () => {
    render(<Harness onSubmit={vi.fn()} />);
    expect(box().tagName).toBe('TEXTAREA');
    fireEvent.change(box(), { target: { value: 'line one\nline two' } });
    expect(box().value).toBe('line one\nline two');
  });

  it('sends on Enter and does not insert a newline', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const notPrevented = fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(false);
  });

  it('leaves Shift+Enter alone so it inserts a newline', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const notPrevented = fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true);
  });

  it('does not send when Enter confirms an IME composition', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    fireEvent.keyDown(box(), { key: 'Enter', isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('enforces the character limit', () => {
    render(<Harness onSubmit={vi.fn()} />);
    expect(box().maxLength).toBe(50);
  });

  it('grows with its content and stops at the maximum number of lines, then scrolls', () => {
    const lineHeight = 20;
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      lineHeight: `${lineHeight}px`,
      paddingTop: '8px',
      paddingBottom: '8px',
      borderTopWidth: '1px',
      borderBottomWidth: '1px',
    } as CSSStyleDeclaration);
    let scrollHeight = lineHeight + 16;
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => scrollHeight);

    render(<Harness onSubmit={vi.fn()} />);
    expect(box().style.height).toBe('38px');
    expect(box().style.overflowY).toBe('hidden');

    scrollHeight = lineHeight * 4 + 16;
    fireEvent.change(box(), { target: { value: 'a\nb\nc\nd' } });
    expect(box().style.height).toBe('98px');
    expect(box().style.overflowY).toBe('hidden');

    scrollHeight = lineHeight * 25 + 16;
    fireEvent.change(box(), { target: { value: 'x\n'.repeat(24) } });
    expect(box().style.height).toBe(`${lineHeight * CHAT_INPUT_MAX_LINES + 18}px`);
    expect(box().style.overflowY).toBe('auto');
  });
});
