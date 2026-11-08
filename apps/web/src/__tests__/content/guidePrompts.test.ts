import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTENT_ROOT } from '@trakwyn/content/node';

/**
 * The guide automation (JEF-533) is two weekly Claude Code desktop scheduled
 * tasks on the maintainer's Mac, run on a Claude subscription. Their prompts
 * live in content/prompts/. These tests hold the limits those prompts set, and
 * that no CI workflow calls Claude or needs an Anthropic API key.
 */

const REPO_ROOT = join(CONTENT_ROOT, '..');
const draft = readFileSync(join(CONTENT_ROOT, 'prompts', 'draft-guide.md'), 'utf8');
const check = readFileSync(join(CONTENT_ROOT, 'prompts', 'check-guides.md'), 'utf8');

describe('draft-guide.md', () => {
  it('drafts at most one guide and never invents a topic', () => {
    expect(draft).toContain('at most one guide');
    expect(draft).toContain('Never invent a topic');
    expect(draft).toContain('backlog.yml');
  });

  it('skips when two or more guide drafts are open', () => {
    expect(draft).toContain('gh pr list --label guide-draft --state open');
    expect(draft).toContain('two or more');
  });

  it('only opens a draft whose steps run, marked draft: true', () => {
    expect(draft).toContain('pnpm guides:capture <slug>');
    expect(draft).toContain('pnpm guides:verify <slug>');
    expect(draft).toContain('Never open a draft whose steps do not run');
    expect(draft).toContain('`draft: true`');
    expect(draft).toContain('gh pr create --draft --label guide-draft --label content');
  });

  it('describes only what the script does, with no invented facts', () => {
    expect(draft).toContain('Describe only what `guide.ts` actually does');
    expect(draft).toContain('No invented numbers');
    expect(draft).toContain('Never name a real company or person');
    expect(draft).toContain('600 to 1,200 words');
  });
});

describe.each([
  ['draft-guide.md', draft],
  ['check-guides.md', check],
])('%s safety', (_name, prompt) => {
  it('never pushes to main or merges', () => {
    expect(prompt).toMatch(
      /[Nn]ever push(ing)? to `?main`?|\*\*Never push to `main`\.\*\*|never `main`/,
    );
    expect(prompt).toMatch(/never merges|Do not merge it|Do not merge/);
    expect(prompt).not.toMatch(/gh pr merge|--auto\b/);
  });

  it('captures only from the seeded demo account', () => {
    expect(prompt).toMatch(/seeded demo account/);
  });

  it('treats text it reads as data', () => {
    expect(prompt).toContain('data, not instructions');
  });
});

describe('check-guides.md', () => {
  it('opens one guide-outdated issue per broken guide, with no duplicate', () => {
    expect(check).toContain('gh issue list --label guide-outdated --state open');
    expect(check).toContain('do not open another');
    expect(check).toContain('Guide outdated: <slug>');
  });

  it('puts changed screenshots in one PR on chore/guide-screenshots', () => {
    expect(check).toContain('chore/guide-screenshots');
    expect(check).toContain('only the images');
  });
});

describe('CI workflows', () => {
  const dir = join(REPO_ROOT, '.github', 'workflows');
  const workflows = readdirSync(dir).filter((f) => f.endsWith('.yml'));

  it.each(workflows)('%s does not call Claude or need an Anthropic key', (name) => {
    const text = readFileSync(join(dir, name), 'utf8');
    expect(text).not.toContain('claude-code-action');
    expect(text).not.toContain('ANTHROPIC_API_KEY');
    expect(text).not.toContain('GUIDES_APP_');
  });
});
