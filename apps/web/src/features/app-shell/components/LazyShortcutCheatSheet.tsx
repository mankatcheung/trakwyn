import { lazy, Suspense, useState } from 'react';

const loadCheatSheet = () =>
  import('./ShortcutCheatSheet').then((m) => ({ default: m.ShortcutCheatSheet }));
const ShortcutCheatSheet = lazy(loadCheatSheet);

/** Starts fetching the cheat sheet's code, e.g. when the user hovers its button. */
export function preloadShortcutCheatSheet(): void {
  void loadCheatSheet();
}

/**
 * Loads the shortcut cheat sheet the first time it is opened (JEF-537), then
 * keeps it mounted so the modal can close with its usual transition.
 */
export function LazyShortcutCheatSheet({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [everOpened, setEverOpened] = useState(isOpen);
  if (isOpen && !everOpened) setEverOpened(true);
  if (!everOpened) return null;
  return (
    <Suspense fallback={null}>
      <ShortcutCheatSheet isOpen={isOpen} onClose={onClose} />
    </Suspense>
  );
}
