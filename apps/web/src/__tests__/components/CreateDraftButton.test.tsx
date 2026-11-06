import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({
  hook: { run: vi.fn(), pending: false, error: null as string | null },
  level: 'ok' as string,
  used: [] as Array<number | undefined>,
}));

vi.mock(
  '#/routes/_authenticated/applications/$applicationId/-components/useCreateOrOpenDraft',
  async (importOriginal) => {
    const actual = await importOriginal<object>();
    return { ...actual, useCreateOrOpenDraft: () => state.hook };
  },
);
vi.mock('#/lib/contentQuota', () => ({
  useQuotaState: (_resource: string, used?: number) => {
    state.used.push(used);
    return { level: state.level };
  },
}));
vi.mock('#/components/QuotaHint', () => ({
  QuotaHint: ({ used }: { used?: number }) => {
    state.used.push(used);
    return null;
  },
}));

import { CreateDraftButton } from '#/routes/_authenticated/applications/$applicationId/-components/CreateDraftButton';

const draft = (id: string, plainText: string) => ({
  id,
  applicationId: 'app-1',
  type: 'resume',
  title: id,
  plainText,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const button = () => screen.getByRole('button', { name: 'Create new' });

describe('CreateDraftButton', () => {
  beforeEach(() => {
    state.hook = { run: vi.fn(), pending: false, error: null };
    state.level = 'ok';
    state.used = [];
  });

  it('counts only drafts with text towards the quota, as the API does', () => {
    render(
      <CreateDraftButton
        applicationId="app-1"
        type="resume"
        drafts={[draft('a', 'words'), draft('b', ''), draft('c', '  \n '), draft('d', 'more')]}
      />,
    );
    expect(state.used.length).toBeGreaterThan(0);
    expect(new Set(state.used)).toEqual(new Set([2]));
  });

  it('is enabled below the cap', () => {
    render(<CreateDraftButton applicationId="app-1" type="resume" drafts={[]} />);
    expect(button()).toBeEnabled();
  });

  it('is disabled at the cap when there is no blank draft to open', () => {
    state.level = 'full';
    render(
      <CreateDraftButton applicationId="app-1" type="resume" drafts={[draft('a', 'words')]} />,
    );
    expect(button()).toBeDisabled();
  });

  it('stays enabled at the cap when a blank draft would be opened instead', () => {
    state.level = 'full';
    render(<CreateDraftButton applicationId="app-1" type="resume" drafts={[draft('a', '')]} />);
    expect(button()).toBeEnabled();
  });

  it('is disabled while running', () => {
    state.hook = { ...state.hook, pending: true };
    render(<CreateDraftButton applicationId="app-1" type="resume" drafts={[]} />);
    expect(button()).toBeDisabled();
  });

  it('shows a failure next to the button', () => {
    state.hook = { ...state.hook, error: 'Draft limit reached' };
    render(<CreateDraftButton applicationId="app-1" type="resume" drafts={[]} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Draft limit reached');
  });
});
