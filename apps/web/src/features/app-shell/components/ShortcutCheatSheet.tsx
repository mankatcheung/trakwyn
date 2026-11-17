import { formatKeyCombo, getKeyModifier } from '#/hooks/useHotkeys';
import { useLocale } from '#/lib/i18n';
import { Modal } from '@trakwyn/ui';

interface Shortcut {
  keys: { key: string; ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean };
  label: string;
}

export function ShortcutCheatSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useLocale();
  const shortcuts: Shortcut[] = [
    { keys: { key: 'k', ctrl: true, shift: true }, label: t('shortcuts.openCommandPalette') },
    { keys: { key: 'n', ctrl: true }, label: t('shortcuts.newApplication') },
    { keys: { key: '/', ctrl: true }, label: t('shortcuts.showShortcuts') },
    { keys: { key: 'Escape' }, label: t('shortcuts.closeModal') },
  ];
  return (
    <Modal open={isOpen} onClose={onClose} title={t('shortcuts.title')} size="sm">
      <ul className="py-2">
        {shortcuts.map((shortcut) => (
          <li
            key={shortcut.label}
            className="flex items-center justify-between px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300"
          >
            <span>{shortcut.label}</span>
            <kbd className="rounded-sm bg-gray-100 px-2 py-1 font-mono text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
              {formatKeyCombo(shortcut.keys)}
            </kbd>
          </li>
        ))}
      </ul>
      <div className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
        {t('shortcuts.pressPrefix')}{' '}
        <kbd className="rounded-sm bg-gray-100 px-1 py-0.5 dark:bg-gray-700">
          {getKeyModifier()} + /
        </kbd>{' '}
        {t('shortcuts.togglePanel')}
      </div>
    </Modal>
  );
}
