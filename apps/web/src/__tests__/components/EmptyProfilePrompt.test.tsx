import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest, mockHref } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockHref: { current: '/applications/app-1/documents/draft-1' },
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search,
  }: {
    children: React.ReactNode;
    to: string;
    search?: { returnTo?: string };
  }) => (
    <a href={search?.returnTo ? `${to}?returnTo=${encodeURIComponent(search.returnTo)}` : to}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: { select: (s: { location: { href: string } }) => string }) =>
    select({ location: { href: mockHref.current } }),
}));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));
vi.mock('#/components/AiCreditsMeter', () => ({ AiCreditsMeter: () => null }));
vi.mock('#/components/ai/hooks/useAiCredits', () => ({
  useAiCredits: () => ({
    onTrakwynAi: false,
    needsSetup: false,
    canAfford: () => true,
    costOf: () => null,
    refresh: vi.fn(),
  }),
}));

import { AiHelperPanel } from '#/routes/_authenticated/applications/$applicationId/-components/AiHelperPanel';

interface Profile {
  workExperiences?: { id: string }[];
  skills?: { id: string }[];
}

const GENERATED = {
  generateIntoDocumentDraft: {
    contentJson: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
    plainText: '',
  },
};

function mockApi({ workExperiences = [], skills = [] }: Profile = {}) {
  mockGqlRequest.mockImplementation((query: string) => {
    if (query.includes('WorkExperiences')) return Promise.resolve({ workExperiences });
    if (query.includes('Skills')) return Promise.resolve({ skills });
    if (query.includes('GenerateIntoDocumentDraft')) return Promise.resolve(GENERATED);
    return Promise.resolve({ documents: [], documentDrafts: [] });
  });
}

function renderPanel(type: 'cover_letter' | 'resume') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const editor = {
    getText: () => '',
    getJson: () => '{}',
    replaceContent: vi.fn(),
    appendContent: vi.fn(),
    setEditable: vi.fn(),
  };
  render(
    <QueryClientProvider client={client}>
      <AiHelperPanel
        draftId="draft-1"
        applicationId="app-1"
        type={type}
        plainText=""
        initialInstructions={null}
        editorRef={{ current: editor }}
        onSave={vi.fn().mockResolvedValue(true)}
      />
    </QueryClientProvider>,
  );
}

const callsTo = (name: string) =>
  mockGqlRequest.mock.calls.filter(([query]) => String(query).includes(name));

/** Waits for the profile lists, so a click is judged on what they say. */
const profileLoaded = async () => {
  await waitFor(() => {
    expect(callsTo('WorkExperiences')).not.toHaveLength(0);
    expect(callsTo('query Skills')).not.toHaveLength(0);
  });
  // The requests were sent; let their answers reach the component.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const generateButton = () => screen.getByRole('button', { name: 'Generate' });

describe('EmptyProfilePrompt in the AI helper (JEF-460, JEF-506)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHref.current = '/applications/app-1/documents/draft-1';
  });

  describe.each(['cover_letter', 'resume'] as const)('on a %s', (type) => {
    it('asks first when the profile has no work experience and no skills', async () => {
      mockApi();
      renderPanel(type);
      await profileLoaded();

      fireEvent.click(generateButton());

      expect(await screen.findByText('Your profile is empty')).toBeInTheDocument();
      expect(callsTo('GenerateIntoDocumentDraft')).toHaveLength(0);
    });

    it('generates when "Generate anyway" is chosen', async () => {
      mockApi();
      renderPanel(type);
      await profileLoaded();

      fireEvent.click(generateButton());
      fireEvent.click(await screen.findByRole('button', { name: /generate anyway/i }));

      await waitFor(() => expect(callsTo('GenerateIntoDocumentDraft')).toHaveLength(1));
      expect(screen.queryByText('Your profile is empty')).not.toBeInTheDocument();
    });

    it.each([
      ['work experience', { workExperiences: [{ id: 'w-1' }] }],
      ['skills', { skills: [{ id: 's-1' }] }],
    ])('generates straight away when the profile has %s', async (_label, profile) => {
      mockApi(profile);
      renderPanel(type);
      await profileLoaded();

      fireEvent.click(generateButton());

      await waitFor(() => expect(callsTo('GenerateIntoDocumentDraft')).toHaveLength(1));
      expect(screen.queryByText('Your profile is empty')).not.toBeInTheDocument();
    });
  });

  it('"Fill in profile" goes to the profile with a way back to this page', async () => {
    mockHref.current = '/applications/app-1/documents/draft-1?from=tab';
    mockApi();
    renderPanel('cover_letter');
    await profileLoaded();

    fireEvent.click(generateButton());

    expect(await screen.findByRole('link', { name: /fill in profile/i })).toHaveAttribute(
      'href',
      `/profile?returnTo=${encodeURIComponent('/applications/app-1/documents/draft-1?from=tab')}`,
    );
  });

  it('does not hold up generating while the profile is still loading', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('WorkExperiences') || query.includes('query Skills'))
        return new Promise(() => {});
      if (query.includes('GenerateIntoDocumentDraft')) return Promise.resolve(GENERATED);
      return Promise.resolve({ documents: [], documentDrafts: [] });
    });
    renderPanel('resume');

    fireEvent.click(generateButton());

    await waitFor(() => expect(callsTo('GenerateIntoDocumentDraft')).toHaveLength(1));
  });
});
