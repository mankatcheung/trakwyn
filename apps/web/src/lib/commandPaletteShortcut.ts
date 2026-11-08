/**
 * The command palette's toggle shortcut (Cmd/Ctrl+Shift+K). Shared by the
 * palette itself and by the shell's lazy wrapper, which has to recognise the
 * first press before the palette's code has loaded (JEF-537).
 */
export function isCommandPaletteShortcut(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'k';
}
