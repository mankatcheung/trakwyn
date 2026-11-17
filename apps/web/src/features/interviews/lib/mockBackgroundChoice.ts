/**
 * Whether practice AI features may send the user's profile to their AI provider
 * (JEF-394). Off until the user switches it on, then remembered in this browser.
 * Only the yes/no is kept: a document id belongs to one application, so it is
 * chosen each time.
 */
const STORAGE_KEY = 'trakwyn.mockUseProfile';

export function readRememberedUseProfile(fallback = false): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? fallback : stored === 'true';
  } catch {
    return fallback;
  }
}

export function rememberUseProfile(useProfile: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(useProfile));
  } catch {
    // Private windows and blocked storage: the choice just is not remembered.
  }
}
