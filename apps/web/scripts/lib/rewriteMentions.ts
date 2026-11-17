import type { RewriteEnv } from './resolveSpecifier.ts';

/**
 * `src/…` or `apps/web/src/…` written in prose or config. The lookbehind keeps
 * `apps/mobile/src/…` and `packages/ui/src/…` out: only web paths are ours.
 */
const MENTION = /(?<![\w/.$@-])((?:apps\/web\/)?)(src\/[\w$@-]+(?:[./][\w$@-]+)*)/g;

/**
 * Update path mentions in Markdown and config text. Only whole file paths that
 * moved are rewritten; a directory mention (`src/lib/`) is left for a human,
 * because the files under it may have gone to different places.
 */
export function rewriteMentions(text: string, env: RewriteEnv): string {
  return text.replace(MENTION, (match, prefix: string, path: string) => {
    const moved = env.renamed(path);
    return moved === path ? match : prefix + moved;
  });
}
