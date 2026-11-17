/** The folders a feature may hold, and the one file (JEF-627). */
export const FEATURE_FOLDERS = ['pages', 'components', 'hooks', 'lib', 'graphql', '__tests__'];
export const FEATURE_FILES = ['CLAUDE.md'];

/**
 * Files under `features/<name>/` that sit outside the allowed layout: a loose file
 * next to the folders, or a folder that is not one of `FEATURE_FOLDERS`. Paths are
 * relative to `src/`.
 */
export function findFeatureStrays(files: readonly string[]): string[] {
  return files.filter((file) => {
    const parts = file.split('/');
    if (parts[0] !== 'features') return false;
    const entry = parts[2];
    if (entry === undefined) return true;
    return parts.length === 3 ? !FEATURE_FILES.includes(entry) : !FEATURE_FOLDERS.includes(entry);
  });
}
