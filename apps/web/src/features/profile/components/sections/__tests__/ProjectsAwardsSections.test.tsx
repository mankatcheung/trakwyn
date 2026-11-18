import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));

import { ProjectsSection } from '#/features/profile/components/sections/ProjectsSection';
import { AwardsSection } from '#/features/profile/components/sections/AwardsSection';
import { gqlContaining, gqlText } from '#/__tests__/helpers/gqlText';

function Wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const project = {
  id: 'p1',
  name: 'Open-source CLI',
  role: 'Maintainer',
  url: null,
  startDate: '2021-03-01T00:00:00.000Z',
  endDate: null,
  description: 'Maintained a CLI used by 2,000 developers.',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const award = {
  id: 'a1',
  title: 'Engineering Excellence Award',
  issuer: 'Acme',
  date: '2022-06-01T00:00:00.000Z',
  description: null,
  createdAt: '2024-01-01T00:00:00.000Z',
};

describe('ProjectsSection (JEF-592)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGqlRequest.mockImplementation((query: string) => {
      if (gqlText(query).includes('query Projects'))
        return Promise.resolve({ projects: [project] });
      return Promise.resolve({});
    });
  });

  it('lists projects with role, start month and description', async () => {
    render(<ProjectsSection />, { wrapper: Wrapper });

    expect(await screen.findByText('Open-source CLI')).toBeInTheDocument();
    expect(screen.getByText('Maintainer · 2021-03')).toBeInTheDocument();
    expect(screen.getByText('Maintained a CLI used by 2,000 developers.')).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    mockGqlRequest.mockResolvedValue({ projects: [] });
    render(<ProjectsSection />, { wrapper: Wrapper });

    expect(await screen.findByText('No projects added yet.')).toBeInTheDocument();
  });

  it('adds one, sending blank optional fields as null', async () => {
    render(<ProjectsSection />, { wrapper: Wrapper });
    await screen.findByText('Open-source CLI');

    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    const name = document.querySelector<HTMLInputElement>('input[name="name"]')!;
    fireEvent.change(name, { target: { value: 'Trakwyn' } });
    fireEvent.submit(name.closest('form')!);

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('createProject'), {
        input: {
          name: 'Trakwyn',
          role: null,
          url: null,
          startDate: null,
          endDate: null,
          description: null,
        },
      }),
    );
  });

  it('hints at what to enter in the name, role and description fields (JEF-614)', async () => {
    render(<ProjectsSection />, { wrapper: Wrapper });
    await screen.findByText('Open-source CLI');

    fireEvent.click(screen.getByRole('button', { name: /add/i }));

    expect(screen.getByPlaceholderText('Personal finance app')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Lead developer')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('What it does, what you built and the result...'),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('https://')).toBeInTheDocument();
  });
});

describe('AwardsSection (JEF-592)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGqlRequest.mockImplementation((query: string) => {
      if (gqlText(query).includes('query Awards')) return Promise.resolve({ awards: [award] });
      return Promise.resolve({});
    });
  });

  it('lists awards with issuer and month', async () => {
    render(<AwardsSection />, { wrapper: Wrapper });

    expect(await screen.findByText('Engineering Excellence Award')).toBeInTheDocument();
    expect(screen.getByText('Acme · 2022-06')).toBeInTheDocument();
  });

  it('hints at what to enter in the title, issuer and description fields (JEF-614)', async () => {
    render(<AwardsSection />, { wrapper: Wrapper });
    await screen.findByText('Engineering Excellence Award');

    fireEvent.click(screen.getByRole('button', { name: /add/i }));

    expect(screen.getByPlaceholderText('Employee of the Year')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Acme Corp')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Why you received it, what it recognised...'),
    ).toBeInTheDocument();
  });

  it('adds one', async () => {
    render(<AwardsSection />, { wrapper: Wrapper });
    await screen.findByText('Engineering Excellence Award');

    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    const title = document.querySelector<HTMLInputElement>('input[name="title"]')!;
    fireEvent.change(title, { target: { value: 'Dean’s List' } });
    fireEvent.submit(title.closest('form')!);

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('createAward'), {
        input: { title: 'Dean’s List', issuer: null, date: null, description: null },
      }),
    );
  });
});
