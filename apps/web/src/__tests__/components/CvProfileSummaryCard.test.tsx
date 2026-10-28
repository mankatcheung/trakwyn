import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, hash }: { children: React.ReactNode; to: string; hash?: string }) => (
    <a href={hash ? `${to}#${hash}` : to}>{children}</a>
  ),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import {
  CvProfileSummaryCard,
  latestRole,
} from '#/routes/_authenticated/-components/CvProfileSummaryCard';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

const role = (overrides: Record<string, unknown> = {}) => ({
  id: 'we-1',
  company: 'Acme Corp',
  title: 'Software Engineer',
  location: null,
  startDate: '2020-01-01T00:00:00.000Z',
  endDate: null,
  description: null,
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2020-01-01T00:00:00.000Z',
  ...overrides,
});

function mockProfile({
  workExperiences = [] as unknown[],
  educations = [] as unknown[],
  skills = [] as unknown[],
} = {}) {
  mockGqlRequest.mockImplementation((query: string) => {
    if (query.includes('WorkExperiences')) return Promise.resolve({ workExperiences });
    if (query.includes('Educations')) return Promise.resolve({ educations });
    if (query.includes('Skills')) return Promise.resolve({ skills });
    return Promise.resolve({});
  });
}

describe('CvProfileSummaryCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invites the user to fill in an empty profile', async () => {
    mockProfile();
    render(<CvProfileSummaryCard />, { wrapper: Wrapper });

    const cta = await screen.findByRole('link', { name: 'Fill in your profile' });
    expect(cta).toHaveAttribute('href', '/profile');
    expect(
      screen.getByText(
        'Add your experience and skills so resumes, cover letters and the assistant are written about you.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /edit profile/i })).not.toBeInTheDocument();
  });

  it('summarises a filled-in profile with counts, the latest role and the next step', async () => {
    mockProfile({
      workExperiences: [
        role({ id: 'we-old', title: 'Intern', endDate: '2019-12-31T00:00:00.000Z' }),
        role({ id: 'we-now', title: 'Staff Engineer', description: 'Led payments.' }),
      ],
      educations: [{ id: 'edu-1' }],
      skills: [{ id: 's-1' }],
    });
    render(<CvProfileSummaryCard />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Staff Engineer at Acme Corp')).toBeInTheDocument();
    });
    expect(screen.getByText('2 roles')).toBeInTheDocument();
    expect(screen.getByText('1 education entry')).toBeInTheDocument();
    expect(screen.getByText('1 skill')).toBeInTheDocument();
    expect(screen.getByText('Profile 75% complete')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add at least 5 skills' })).toHaveAttribute(
      'href',
      '/profile#skills',
    );
    expect(screen.getByRole('link', { name: /edit profile/i })).toHaveAttribute('href', '/profile');
  });

  it('says the profile is complete once every check passes', async () => {
    mockProfile({
      workExperiences: [role({ description: 'Led payments.' })],
      educations: [{ id: 'edu-1' }],
      skills: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id })),
    });
    render(<CvProfileSummaryCard />, { wrapper: Wrapper });

    expect(await screen.findByText('Your profile is complete.')).toBeInTheDocument();
    expect(screen.getByText('Profile 100% complete')).toBeInTheDocument();
  });

  it('renders nothing when the profile cannot be loaded', async () => {
    mockGqlRequest.mockRejectedValue(new Error('boom'));
    const { container } = render(<CvProfileSummaryCard />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });
});

describe('latestRole', () => {
  it('prefers a role still held over one that started later but has ended', () => {
    const current = role({ id: 'current', startDate: '2018-01-01T00:00:00.000Z' });
    const ended = role({
      id: 'ended',
      startDate: '2021-01-01T00:00:00.000Z',
      endDate: '2023-01-01T00:00:00.000Z',
    });
    expect(latestRole([ended, current])?.id).toBe('current');
  });

  it('picks the most recently ended role when none is current', () => {
    const older = role({ id: 'older', endDate: '2019-01-01T00:00:00.000Z' });
    const newer = role({ id: 'newer', endDate: '2022-01-01T00:00:00.000Z' });
    expect(latestRole([older, newer])?.id).toBe('newer');
  });

  it('breaks a tie between current roles by the later start date', () => {
    const first = role({ id: 'first', startDate: '2019-01-01T00:00:00.000Z' });
    const second = role({ id: 'second', startDate: '2022-01-01T00:00:00.000Z' });
    expect(latestRole([first, second])?.id).toBe('second');
  });

  it('returns null without any roles', () => {
    expect(latestRole([])).toBeNull();
  });
});
