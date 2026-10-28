import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest, mockNavigate, mockHref } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockNavigate: vi.fn(),
  mockHref: { current: '/applications/app-1/documents/cover-letters/new' },
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
  useNavigate: () => mockNavigate,
  useRouterState: ({ select }: { select: (s: { location: { href: string } }) => string }) =>
    select({ location: { href: mockHref.current } }),
}));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));

import { NewDraftForm } from '#/routes/_authenticated/applications/$applicationId/-components/NewDraftForm';

interface Profile {
  workExperiences?: { id: string }[];
  skills?: { id: string }[];
}

function mockApi({ workExperiences = [], skills = [] }: Profile = {}) {
  mockGqlRequest.mockImplementation((query: string) => {
    if (query.includes('WorkExperiences')) return Promise.resolve({ workExperiences });
    if (query.includes('Skills')) return Promise.resolve({ skills });
    if (query.includes('GenerateCoverLetter'))
      return Promise.resolve({ generateCoverLetter: { id: 'draft-new' } });
    if (query.includes('GenerateResume'))
      return Promise.resolve({ generateResume: { id: 'draft-new', applicationId: 'app-1' } });
    return Promise.resolve({ documents: [], documentDrafts: [] });
  });
}

function renderForm(type: 'cover_letter' | 'resume') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NewDraftForm applicationId="app-1" type={type} />
    </QueryClientProvider>,
  );
}

const generateCalls = (name: string) =>
  mockGqlRequest.mock.calls.filter(([query]) => String(query).includes(name));

/** Waits for the profile lists, so a click is judged on what they say. */
const profileLoaded = () =>
  waitFor(() => {
    expect(generateCalls('WorkExperiences')).not.toHaveLength(0);
    expect(generateCalls('query Skills')).not.toHaveLength(0);
  });

describe('EmptyProfilePrompt (JEF-460)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHref.current = '/applications/app-1/documents/cover-letters/new';
  });

  describe.each([
    ['cover_letter', /generate cover letter/i, 'GenerateCoverLetter'],
    ['resume', /generate resume/i, 'GenerateResume'],
  ] as const)('on the %s form', (type, buttonName, mutation) => {
    it('asks first when the profile has no work experience and no skills', async () => {
      mockApi();
      renderForm(type);
      await profileLoaded();

      fireEvent.click(screen.getByRole('button', { name: buttonName }));

      expect(await screen.findByText('Your profile is empty')).toBeInTheDocument();
      expect(generateCalls(mutation)).toHaveLength(0);
    });

    it('generates when "Generate anyway" is chosen', async () => {
      mockApi();
      renderForm(type);
      await profileLoaded();

      fireEvent.click(screen.getByRole('button', { name: buttonName }));
      fireEvent.click(await screen.findByRole('button', { name: /generate anyway/i }));

      await waitFor(() => expect(generateCalls(mutation)).toHaveLength(1));
      expect(screen.queryByText('Your profile is empty')).not.toBeInTheDocument();
    });

    it.each([
      ['work experience', { workExperiences: [{ id: 'w-1' }] }],
      ['skills', { skills: [{ id: 's-1' }] }],
    ])('generates straight away when the profile has %s', async (_label, profile) => {
      mockApi(profile);
      renderForm(type);
      await profileLoaded();

      fireEvent.click(screen.getByRole('button', { name: buttonName }));

      await waitFor(() => expect(generateCalls(mutation)).toHaveLength(1));
      expect(screen.queryByText('Your profile is empty')).not.toBeInTheDocument();
    });
  });

  it('"Fill in profile" goes to the profile with a way back to this page', async () => {
    mockHref.current = '/applications/app-1/documents/cover-letters/new?from=tab';
    mockApi();
    renderForm('cover_letter');
    await profileLoaded();

    fireEvent.click(screen.getByRole('button', { name: /generate cover letter/i }));

    expect(await screen.findByRole('link', { name: /fill in profile/i })).toHaveAttribute(
      'href',
      `/profile?returnTo=${encodeURIComponent('/applications/app-1/documents/cover-letters/new?from=tab')}`,
    );
  });

  it('does not hold up generating while the profile is still loading', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('WorkExperiences') || query.includes('query Skills'))
        return new Promise(() => {});
      if (query.includes('GenerateResume'))
        return Promise.resolve({ generateResume: { id: 'draft-new', applicationId: 'app-1' } });
      return Promise.resolve({ documents: [] });
    });
    renderForm('resume');

    fireEvent.click(screen.getByRole('button', { name: /generate resume/i }));

    await waitFor(() => expect(generateCalls('GenerateResume')).toHaveLength(1));
  });
});
