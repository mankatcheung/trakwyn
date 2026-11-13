import type { ReactNode } from 'react';

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform);

/** `Mod-b` style shortcut as the reader's keyboard names it. */
function shortcutLabel(keys: string): string {
  const mac = isMac();
  return keys
    .split('-')
    .map((key) => {
      if (key === 'Mod') return mac ? '⌘' : 'Ctrl';
      if (key === 'Shift') return mac ? '⇧' : 'Shift';
      return key.toUpperCase();
    })
    .join(mac ? '' : '+');
}

interface ToolbarButtonProps {
  label: string;
  shortcut?: string;
  onClick: () => void;
  /** Set for toggles, so assistive tech reads the state. Omit for plain actions. */
  pressed?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

export function ToolbarButton({
  label,
  shortcut,
  onClick,
  pressed,
  disabled,
  children,
}: ToolbarButtonProps) {
  const hint = shortcut ? `${label} (${shortcutLabel(shortcut)})` : label;
  return (
    <button
      type="button"
      title={hint}
      aria-label={label}
      aria-keyshortcuts={shortcut?.replace('Mod', 'Control')}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-sm p-1.5 transition-colors ${
        pressed
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
      } ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
    >
      {children}
    </button>
  );
}
