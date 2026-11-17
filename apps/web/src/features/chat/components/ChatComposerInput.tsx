import { useLayoutEffect, useRef } from 'react';
import { Textarea } from '@trakwyn/ui';
import { CHAT_INPUT_MAX_LINES } from '#/constants';

const FALLBACK_LINE_HEIGHT_PX = 20;

interface ChatComposerInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called on Enter (without Shift). The caller decides whether there is anything to send. */
  onSubmit: () => void;
  placeholder: string;
  maxLength: number;
}

/**
 * The chat message box (JEF-481): one line when empty, growing with its
 * content up to `CHAT_INPUT_MAX_LINES`, then scrolling. Enter sends and
 * Shift+Enter inserts a newline; Enter during IME composition is left alone
 * so confirming a candidate never sends the message.
 */
export function ChatComposerInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  maxLength,
}: ChatComposerInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const style = getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight) || FALLBACK_LINE_HEIGHT_PX;
    const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const borders =
      (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    const maxHeight = lineHeight * CHAT_INPUT_MAX_LINES + padding + borders;
    // scrollHeight excludes borders; the box is border-box, so add them back.
    const wanted = el.scrollHeight + borders;
    el.style.height = `${Math.min(wanted, maxHeight)}px`;
    el.style.overflowY = wanted > maxHeight ? 'auto' : 'hidden';
  }, [value]);

  return (
    <Textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
        e.preventDefault();
        onSubmit();
      }}
      placeholder={placeholder}
      maxLength={maxLength}
      className="flex-1"
    />
  );
}
