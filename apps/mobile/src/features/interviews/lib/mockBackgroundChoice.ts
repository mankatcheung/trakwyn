/**
 * Whether practice AI features may send the user's profile to their AI provider
 * (JEF-394). Off until the user switches it on in a dialog; the choice is then
 * kept for the rest of the session so a one-tap action, such as drafting an
 * answer, follows what they last chose. Deliberately not persisted: the profile
 * is personal data, so each launch starts from "off".
 */
let useProfile = false;

export function getRememberedUseProfile(): boolean {
  return useProfile;
}

export function rememberUseProfile(next: boolean): void {
  useProfile = next;
}
