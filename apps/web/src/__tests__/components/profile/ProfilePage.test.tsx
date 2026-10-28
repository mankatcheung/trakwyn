import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentType } from 'react';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: object) => ({ ...opts, useSearch: () => ({}) }),
  Link: ({ children, to, hash }: { children: React.ReactNode; to: string; hash?: string }) => (
    <a href={hash ? `${to}#${hash}` : to}>{children}</a>
  ),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { Route } from '#/routes/_authenticated/profile/index';

const ProfilePage = (Route as unknown as { component: ComponentType }).component;

const skill = (id: string, name: string) => ({
  id,
  name,
  category: null,
  proficiency: null,
  createdAt: '2020-01-01T00:00:00.000Z',
});

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('WorkExperiences')) return Promise.resolve({ workExperiences: [] });
      if (query.includes('Educations')) return Promise.resolve({ educations: [] });
      if (query.includes('Skills')) return Promise.resolve({ skills: [] });
      return Promise.resolve({});
    });
  });

  it('shows loading placeholders instead of empty states while the requests are in flight', () => {
    mockGqlRequest.mockReturnValue(new Promise(() => {}));
    render(<ProfilePage />, { wrapper: Wrapper });

    expect(screen.queryByText('No work experiences added yet.')).not.toBeInTheDocument();
    expect(screen.queryByText('No education entries added yet.')).not.toBeInTheDocument();
    expect(screen.queryByText('No skills added yet.')).not.toBeInTheDocument();
  });

  it('shows empty states for all three sections when there is no data', async () => {
    render(<ProfilePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('No work experiences added yet.')).toBeInTheDocument();
    });
    expect(screen.getByText('No education entries added yet.')).toBeInTheDocument();
    expect(screen.getByText('No skills added yet.')).toBeInTheDocument();
  });

  it('renders an existing work experience entry', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('WorkExperiences')) {
        return Promise.resolve({
          workExperiences: [
            {
              id: 'we-1',
              company: 'Acme Corp',
              title: 'Software Engineer',
              location: 'Remote',
              startDate: '2020-01-01T00:00:00.000Z',
              endDate: null,
              description: 'Built things.',
              createdAt: '2020-01-01T00:00:00.000Z',
              updatedAt: '2020-01-01T00:00:00.000Z',
            },
          ],
        });
      }
      if (query.includes('Educations')) return Promise.resolve({ educations: [] });
      if (query.includes('Skills')) return Promise.resolve({ skills: [] });
      return Promise.resolve({});
    });

    render(<ProfilePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Software Engineer at Acme Corp')).toBeInTheDocument();
    });
    expect(screen.getByText('Remote')).toBeInTheDocument();
  });

  it('creates a new work experience via the form', async () => {
    render(<ProfilePage />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText('No work experiences added yet.')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: /add/i })[0]);

    fireEvent.change(screen.getByPlaceholderText('Acme Corp'), {
      target: { value: 'Globex' },
    });
    fireEvent.change(screen.getByPlaceholderText('Software Engineer'), {
      target: { value: 'Staff Engineer' },
    });
    fireEvent.change(screen.getByPlaceholderText('San Francisco, CA'), {
      target: { value: '' },
    });
    const form = screen.getByPlaceholderText('Acme Corp').closest('form')!;
    const dateInputs = form.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: '2021-05-01' } });

    fireEvent.click(within(form).getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('CreateWorkExperience'),
        expect.objectContaining({
          input: expect.objectContaining({ company: 'Globex', title: 'Staff Engineer' }),
        }),
      );
    });
  });

  it('deletes a work experience entry', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('WorkExperiences')) {
        return Promise.resolve({
          workExperiences: [
            {
              id: 'we-1',
              company: 'Acme Corp',
              title: 'Software Engineer',
              location: null,
              startDate: '2020-01-01T00:00:00.000Z',
              endDate: null,
              description: null,
              createdAt: '2020-01-01T00:00:00.000Z',
              updatedAt: '2020-01-01T00:00:00.000Z',
            },
          ],
        });
      }
      if (query.includes('Educations')) return Promise.resolve({ educations: [] });
      if (query.includes('Skills')) return Promise.resolve({ skills: [] });
      if (query.includes('DeleteWorkExperience'))
        return Promise.resolve({ deleteWorkExperience: true });
      return Promise.resolve({});
    });

    render(<ProfilePage />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText('Software Engineer at Acme Corp')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('DeleteWorkExperience'), {
        id: 'we-1',
      });
    });
  });

  it('creates a new skill via the form', async () => {
    render(<ProfilePage />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText('No skills added yet.')).toBeInTheDocument();
    });

    const addButtons = screen.getAllByRole('button', { name: /add/i });
    fireEvent.click(addButtons[addButtons.length - 1]);

    fireEvent.change(screen.getByPlaceholderText('TypeScript'), {
      target: { value: 'GraphQL' },
    });
    const form = screen.getByPlaceholderText('TypeScript').closest('form')!;
    fireEvent.click(within(form).getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('CreateSkill'),
        expect.objectContaining({ input: expect.objectContaining({ name: 'GraphQL' }) }),
      );
    });
  });

  it('pre-fills the education form when editing an existing entry', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('WorkExperiences')) return Promise.resolve({ workExperiences: [] });
      if (query.includes('Educations')) {
        return Promise.resolve({
          educations: [
            {
              id: 'edu-1',
              institution: 'MIT',
              degree: 'B.S.',
              field: 'Computer Science',
              startDate: '2015-09-01T00:00:00.000Z',
              endDate: '2019-06-01T00:00:00.000Z',
              description: null,
              createdAt: '2015-09-01T00:00:00.000Z',
              updatedAt: '2015-09-01T00:00:00.000Z',
            },
          ],
        });
      }
      if (query.includes('Skills')) return Promise.resolve({ skills: [] });
      return Promise.resolve({});
    });

    render(<ProfilePage />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText(/MIT/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByDisplayValue('MIT')).toBeInTheDocument();
    expect(screen.getByDisplayValue('B.S.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^update$/i })).toBeInTheDocument();
  });

  it('links each section from the in-page nav', async () => {
    render(<ProfilePage />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText('No skills added yet.')).toBeInTheDocument();
    });

    const nav = screen.getByRole('navigation', { name: 'Profile sections' });
    const hrefs = within(nav)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(['#work-experience', '#education', '#skills']);
    for (const href of hrefs) {
      expect(document.getElementById(href!.slice(1))).not.toBeNull();
    }
  });

  it('shows 0% and points at adding a role when the profile is empty', async () => {
    render(<ProfilePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Profile 0% complete')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: "Add a role you've held" })).toHaveAttribute(
      'href',
      '/profile#work-experience',
    );
  });

  it('asks for more skills once the other checks pass', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('WorkExperiences')) {
        return Promise.resolve({
          workExperiences: [
            {
              id: 'we-1',
              company: 'Acme Corp',
              title: 'Software Engineer',
              location: null,
              startDate: '2020-01-01T00:00:00.000Z',
              endDate: null,
              description: 'Built things.',
              createdAt: '2020-01-01T00:00:00.000Z',
              updatedAt: '2020-01-01T00:00:00.000Z',
            },
          ],
        });
      }
      if (query.includes('Educations')) {
        return Promise.resolve({
          educations: [
            {
              id: 'edu-1',
              institution: 'MIT',
              degree: null,
              field: null,
              startDate: '2015-09-01T00:00:00.000Z',
              endDate: null,
              description: null,
              createdAt: '2015-09-01T00:00:00.000Z',
              updatedAt: '2015-09-01T00:00:00.000Z',
            },
          ],
        });
      }
      if (query.includes('Skills')) return Promise.resolve({ skills: [skill('s-1', 'Go')] });
      return Promise.resolve({});
    });

    render(<ProfilePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Profile 75% complete')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Add at least 5 skills' })).toHaveAttribute(
      'href',
      '/profile#skills',
    );
  });

  describe('importing from a CV (JEF-461)', () => {
    it('opens the import dialog from the header button', () => {
      render(<ProfilePage />, { wrapper: Wrapper });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Import from CV' }));

      expect(screen.getByRole('dialog', { name: 'Import from your CV' })).toBeInTheDocument();
    });

    it('closes the dialog again and leaves the profile as it was', async () => {
      render(<ProfilePage />, { wrapper: Wrapper });
      fireEvent.click(screen.getByRole('button', { name: 'Import from CV' }));

      fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByText('No skills added yet.')).toBeInTheDocument();
      });
    });
  });
});
