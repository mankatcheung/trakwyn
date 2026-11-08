import { lazy, Suspense, useEffect, useState } from 'react';
import { isCommandPaletteShortcut } from '#/lib/commandPaletteShortcut';

const CommandPalette = lazy(() =>
  import('./CommandPalette').then((m) => ({ default: m.CommandPalette })),
);

/**
 * Mounts the command palette on its first shortcut press rather than on every
 * authenticated page load (JEF-537): nobody sees it on first paint, so its code
 * stays out of the shell's initial JS. The palette then mounts already open and
 * owns the shortcut from there on.
 */
export function LazyCommandPalette() {
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    if (requested) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isCommandPaletteShortcut(e)) return;
      e.preventDefault();
      setRequested(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [requested]);

  if (!requested) return null;
  return (
    <Suspense fallback={null}>
      <CommandPalette initialOpen />
    </Suspense>
  );
}
