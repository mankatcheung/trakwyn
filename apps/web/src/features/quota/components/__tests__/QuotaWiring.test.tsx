import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { ContactsTab } from '#/routes/_authenticated/applications/$applicationId/-components/ContactsTab';
import { ProfileSection } from '#/routes/_authenticated/profile/-components/ProfileSection';

function Wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const LIMITS = {
  notesPerApplication: 10,
  contactsPerApplication: 3,
  interviewRoundsPerApplication: 10,
  offersPerApplication: 10,
  tagsPerApplication: 10,
  documentDraftsPerApplication: 10,
  conversationsPerUser: 50,
  workExperiencesPerUser: 20,
  educationsPerUser: 20,
  skillsPerUser: 5,
  shareLinksPerUser: 10,
  apiTokensPerUser: 10,
  pushSubscriptionsPerUser: 10,
};
const USAGE = {
  conversations: 0,
  workExperiences: 0,
  educations: 0,
  skills: 0,
  shareLinks: 0,
  apiTokens: 0,
  pushSubscriptions: 0,
};

const contact = (i: number) => ({
  id: `c${i}`,
  applicationId: 'a1',
  name: `Contact ${i}`,
  role: null,
  email: null,
  phone: null,
  linkedinUrl: null,
  notes: null,
  createdAt: '2026-11-02T10:00:00Z',
  updatedAt: '2026-11-02T10:00:00Z',
});

beforeEach(() => {
  mockGqlRequest.mockReset();
});

describe('ContactsTab at the cap (JEF-494)', () => {
  it('disables Add contact and names the limit', async () => {
    mockGqlRequest.mockImplementation((query: string) =>
      query.includes('ContentQuota')
        ? Promise.resolve({ contentQuota: { limits: LIMITS, usage: USAGE } })
        : Promise.resolve({ contacts: [contact(1), contact(2), contact(3)] }),
    );
    render(<ContactsTab applicationId="a1" />, { wrapper: Wrapper });

    expect(await screen.findByRole('alert')).toHaveTextContent('Limit reached: 3 contacts');
    expect(screen.getByRole('button', { name: 'Add contact' })).toBeDisabled();
  });

  it('shows "N of M" when close to the limit and keeps Add contact enabled', async () => {
    mockGqlRequest.mockImplementation((query: string) =>
      query.includes('ContentQuota')
        ? Promise.resolve({
            contentQuota: { limits: { ...LIMITS, contactsPerApplication: 5 }, usage: USAGE },
          })
        : Promise.resolve({ contacts: [contact(1), contact(2), contact(3), contact(4)] }),
    );
    render(<ContactsTab applicationId="a1" />, { wrapper: Wrapper });

    expect(await screen.findByText('4 of 5 contacts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add contact' })).toBeEnabled();
  });
});

describe('ProfileSection quota (JEF-494)', () => {
  const renderSection = (props: { used: number; createError?: unknown; onAdd?: () => void }) =>
    render(
      <ProfileSection
        id="skills"
        icon={null}
        title="Skills"
        description="What you know"
        onAdd={props.onAdd ?? (() => {})}
        quota={{ resource: 'skills', used: props.used }}
        createError={props.createError}
      >
        <div>body</div>
      </ProfileSection>,
      { wrapper: Wrapper },
    );

  beforeEach(() => {
    mockGqlRequest.mockResolvedValue({ contentQuota: { limits: LIMITS, usage: USAGE } });
  });

  it('disables Add at the cap and says why', async () => {
    renderSection({ used: 5 });

    expect(await screen.findByRole('alert')).toHaveTextContent('Limit reached: 5 skills');
    expect(screen.getByRole('button', { name: /add/i })).toBeDisabled();
  });

  it('leaves Add working below the cap', async () => {
    const onAdd = vi.fn();
    renderSection({ used: 1, onAdd });

    await vi.waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    expect(onAdd).toHaveBeenCalled();
  });

  it("shows the API's message for a failed create", async () => {
    renderSection({
      used: 1,
      createError: {
        response: {
          errors: [{ message: 'Skills limit reached: 5', extensions: { code: 'QUOTA_EXCEEDED' } }],
        },
      },
    });

    expect(await screen.findByText('Skills limit reached: 5')).toBeInTheDocument();
  });
});
