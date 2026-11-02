import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { QuotaHint } from '#/components/QuotaHint';
import { NotesTab } from '#/routes/_authenticated/applications/$applicationId/-components/NotesTab';
import { quotaLevel } from '#/lib/contentQuota';

function Wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const LIMITS = {
  notesPerApplication: 10,
  contactsPerApplication: 10,
  interviewRoundsPerApplication: 10,
  offersPerApplication: 10,
  tagsPerApplication: 10,
  documentDraftsPerApplication: 10,
  conversationsPerUser: 50,
  workExperiencesPerUser: 20,
  educationsPerUser: 20,
  skillsPerUser: 100,
  shareLinksPerUser: 10,
  apiTokensPerUser: 10,
  pushSubscriptionsPerUser: 10,
};
const USAGE = {
  conversations: 0,
  workExperiences: 0,
  educations: 0,
  skills: 92,
  shareLinks: 10,
  apiTokens: 0,
  pushSubscriptions: 0,
};

const note = (i: number) => ({
  id: `n${i}`,
  applicationId: 'a1',
  content: `note ${i}`,
  createdAt: '2026-11-02T10:00:00Z',
  updatedAt: '2026-11-02T10:00:00Z',
});

describe('quotaLevel', () => {
  it('is ok below 80%, warning from 80%, full at the limit', () => {
    expect(quotaLevel(7, 10)).toBe('ok');
    expect(quotaLevel(8, 10)).toBe('warning');
    expect(quotaLevel(10, 10)).toBe('full');
    expect(quotaLevel(11, 10)).toBe('full');
  });
});

describe('QuotaHint', () => {
  beforeEach(() => {
    mockGqlRequest.mockReset();
    mockGqlRequest.mockResolvedValue({ contentQuota: { limits: LIMITS, usage: USAGE } });
  });

  it('shows nothing while usage is low', async () => {
    const { container } = render(<QuotaHint resource="notes" used={3} />, { wrapper: Wrapper });
    await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows "N of M" from 80% of a per-application limit', async () => {
    render(<QuotaHint resource="notes" used={9} />, { wrapper: Wrapper });
    expect(await screen.findByText('9 of 10 notes')).toBeInTheDocument();
  });

  it('reads per-user usage from the API', async () => {
    render(<QuotaHint resource="skills" />, { wrapper: Wrapper });
    expect(await screen.findByText('92 of 100 skills')).toBeInTheDocument();
  });

  it('names the limit at the cap', async () => {
    render(<QuotaHint resource="shareLinks" />, { wrapper: Wrapper });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Limit reached: 10 share links. Delete one to add another.',
    );
  });
});

describe('NotesTab at the cap', () => {
  beforeEach(() => {
    mockGqlRequest.mockReset();
  });

  it('disables Add note and names the limit', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('ContentQuota'))
        return Promise.resolve({ contentQuota: { limits: LIMITS, usage: USAGE } });
      return Promise.resolve({ notes: Array.from({ length: 10 }, (_, i) => note(i)) });
    });
    render(<NotesTab applicationId="a1" enabled />, { wrapper: Wrapper });

    expect(await screen.findByRole('alert')).toHaveTextContent('Limit reached: 10 notes');
    fireEvent.change(screen.getByPlaceholderText(/note/i), { target: { value: 'one more' } });
    expect(screen.getByRole('button', { name: 'Add note' })).toBeDisabled();
  });

  it("shows the API's message when a create loses the race", async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('ContentQuota'))
        return Promise.resolve({ contentQuota: { limits: LIMITS, usage: USAGE } });
      if (query.includes('CreateNote'))
        return Promise.reject({
          response: {
            errors: [
              {
                message: 'Notes limit reached: 10 per application',
                extensions: { code: 'QUOTA_EXCEEDED' },
              },
            ],
          },
        });
      return Promise.resolve({ notes: [note(1)] });
    });
    render(<NotesTab applicationId="a1" enabled />, { wrapper: Wrapper });

    await screen.findByText('note 1');
    fireEvent.change(screen.getByPlaceholderText(/note/i), { target: { value: 'one more' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));

    expect(await screen.findByText('Notes limit reached: 10 per application')).toBeInTheDocument();
  });
});
