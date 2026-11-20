import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * `KeyboardAvoidingView` is only rendered through `KeyboardAvoidingScreen` (JEF-661).
 *
 * The raw view measures its frame against its parent, not the window, so on a screen that
 * starts below the top of the window (a navigation header, an iOS page-sheet modal) it
 * underestimates how much the keyboard covers and the lowest input stays behind it (JEF-377).
 * The wrapper measures the offset; a new raw use quietly brings the bug back.
 *
 * The files below are the exceptions: full-window overlays and screens without a header,
 * where the frame already starts at the window top so the offset is zero. Keep this list
 * short; a file that no longer needs its entry must lose it.
 */

const SRC = resolve(__dirname, '../..');
const WRAPPER = 'components/KeyboardAvoidingScreen.tsx';

const FULL_WINDOW_EXCEPTIONS = new Set([
  // Transparent bottom sheets and overlays: the sheet hugs the bottom of the window.
  'features/documents/components/AiHelperSheet.tsx',
  'features/settings/screens/AiSettingsScreen.tsx', // limit editor and add-provider sheets
  'features/settings/components/TimezonePicker.tsx',
  // No navigation header: the frame starts at the top of the window.
  'features/verification/screens/VerifyEmailRequiredScreen.tsx',
  'screens/auth/ForgotPasswordScreen.tsx',
  'screens/auth/LoginScreen.tsx',
  'screens/auth/RegisterScreen.tsx',
  'screens/auth/ResetPasswordScreen.tsx',
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function usesRawView(file: string): boolean {
  return /<KeyboardAvoidingView\b/.test(readFileSync(file, 'utf8'));
}

describe('KeyboardAvoidingView usage', () => {
  const users = sourceFiles(SRC)
    .map((file) => relative(SRC, file))
    .filter((file) => usesRawView(join(SRC, file)));

  it('is rendered only by the wrapper and the full-window exceptions', () => {
    const unexpected = users.filter(
      (file) => file !== WRAPPER && !FULL_WINDOW_EXCEPTIONS.has(file),
    );
    expect(unexpected).toEqual([]);
  });

  it('keeps no exception that no longer uses the raw view', () => {
    const stale = [...FULL_WINDOW_EXCEPTIONS].filter((file) => !users.includes(file));
    expect(stale).toEqual([]);
  });
});
