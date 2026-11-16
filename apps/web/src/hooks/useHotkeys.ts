import { useEffect, useEffectEvent, useState } from 'react';

type KeyCombo = {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
};

type HotkeyHandler = (e: KeyboardEvent) => void;

export function getKeyModifier(): string {
  if (typeof navigator === 'undefined') return 'Ctrl';
  return navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl';
}

export function formatKeyCombo(combo: KeyCombo): string {
  const parts: string[] = [];
  if (combo.ctrl) parts.push(getKeyModifier());
  if (combo.meta) parts.push(getKeyModifier());
  if (combo.shift) parts.push('Shift');
  if (combo.alt) parts.push('Alt');
  parts.push(combo.key.toUpperCase());
  return parts.join(' + ');
}

export function useHotkeys(combo: KeyCombo, handler: HotkeyHandler, enabled = true) {
  // An Effect Event always reads the latest combo, handler and enabled, so the
  // listener below registers once instead of on every render.
  const handleKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (!enabled) return;

    const keyMatch = e.key.toLowerCase() === combo.key.toLowerCase();
    const ctrlMatch = combo.ctrl ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.metaKey;
    const metaMatch = combo.meta ? e.metaKey || e.ctrlKey : !e.metaKey && !e.ctrlKey;
    const shiftMatch = combo.shift ? e.shiftKey : !e.shiftKey;
    const altMatch = combo.alt ? e.altKey : !e.altKey;

    if (keyMatch && ctrlMatch && metaMatch && shiftMatch && altMatch) {
      e.preventDefault();
      handler(e);
    }
  });

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}

export function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(navigator.platform.startsWith('Mac'));
  }, []);

  return isMac;
}
