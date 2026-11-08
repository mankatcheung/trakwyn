import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useLocale } from '#/lib/i18n';
import { isCommandPaletteShortcut } from '#/lib/commandPaletteShortcut';
import {
  SearchIcon,
  BriefcaseIcon,
  LayoutDashboardIcon,
  BarChart2Icon,
  UserIcon,
  PlusIcon,
  TrashIcon,
} from 'lucide-react';

interface CommandItem {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  action: () => void;
}

/**
 * `initialOpen` is for the shell's lazy wrapper, which mounts the palette in
 * response to the shortcut press that should also open it.
 */
export function CommandPalette({ initialOpen = false }: { initialOpen?: boolean }) {
  const { t } = useLocale();
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const commands: CommandItem[] = useMemo(
    () => [
      {
        id: 'dashboard',
        label: t('commands.dashboard'),
        icon: <LayoutDashboardIcon size={16} />,
        action: () => navigate({ to: '/dashboard' }),
      },
      {
        id: 'applications',
        label: t('commands.applications'),
        icon: <BriefcaseIcon size={16} />,
        action: () => navigate({ to: '/applications' }),
      },
      {
        id: 'new-application',
        label: t('commands.newApplication'),
        shortcut: '⌘N',
        icon: <PlusIcon size={16} />,
        action: () => navigate({ to: '/applications/new' }),
      },
      {
        id: 'trash',
        label: t('commands.trash'),
        icon: <TrashIcon size={16} />,
        action: () => navigate({ to: '/applications/trash' }),
      },
      {
        id: 'analytics',
        label: t('commands.analytics'),
        icon: <BarChart2Icon size={16} />,
        action: () => navigate({ to: '/analytics' }),
      },
      {
        id: 'account',
        label: t('commands.account'),
        icon: <UserIcon size={16} />,
        action: () => navigate({ to: '/account' }),
      },
    ],
    [navigate, t],
  );

  const filtered = useMemo(() => {
    if (!query) return commands;
    return commands.filter((cmd) => cmd.label.toLowerCase().includes(query.toLowerCase()));
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isCommandPaletteShortcut(e)) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery('');
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      filtered[selectedIndex].action();
      setIsOpen(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="fixed inset-0 bg-black/50" onClick={() => setIsOpen(false)} />
      <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <SearchIcon size={18} className="text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder={t('commands.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none dark:text-gray-100"
          />
          <kbd className="hidden items-center gap-1 rounded-sm bg-gray-100 px-2 py-0.5 text-xs text-gray-500 sm:inline-flex dark:bg-gray-700 dark:text-gray-400">
            ESC
          </kbd>
        </div>
        <ul className="max-h-64 overflow-auto py-2">
          {filtered.length === 0 && (
            <li className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
              {t('commands.noResults')}
            </li>
          )}
          {filtered.map((cmd, i) => (
            <li
              key={cmd.id}
              className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm ${
                i === selectedIndex
                  ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/50'
              }`}
              onClick={() => {
                cmd.action();
                setIsOpen(false);
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="text-gray-400">{cmd.icon}</span>
              <span className="flex-1">{cmd.label}</span>
              {cmd.shortcut && (
                <kbd className="rounded-sm bg-gray-100 px-1.5 py-0.5 text-xs text-gray-400 dark:bg-gray-700">
                  {cmd.shortcut}
                </kbd>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
