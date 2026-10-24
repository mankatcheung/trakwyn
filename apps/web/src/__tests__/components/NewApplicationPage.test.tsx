import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockNavigate, mockGqlRequest } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGqlRequest: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: unknown) => opts,
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

vi.mock('#/lib/queryClient', () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));

import { NewApplicationPage } from '#/routes/_authenticated/applications/-components/NewApplicationPage';

describe('NewApplicationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders company and role inputs', () => {
    render(<NewApplicationPage />);
    expect(screen.getByPlaceholderText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Senior Engineer')).toBeInTheDocument();
  });

  it('shows validation error when company is empty', async () => {
    render(<NewApplicationPage />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText('Company is required')).toBeInTheDocument();
    });
    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('shows validation error when role is empty', async () => {
    render(<NewApplicationPage />);
    fireEvent.change(screen.getByPlaceholderText('Acme Corp'), {
      target: { value: 'Acme Corp' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText('Role is required')).toBeInTheDocument();
    });
    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('submits the form with company and role', async () => {
    mockGqlRequest.mockResolvedValue({ createApplication: { id: 'new-1' } });
    render(<NewApplicationPage />);

    fireEvent.change(screen.getByPlaceholderText('Acme Corp'), {
      target: { value: 'Acme Corp' },
    });
    fireEvent.change(screen.getByPlaceholderText('Senior Engineer'), {
      target: { value: 'Engineer' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('CreateApplication'),
        expect.objectContaining({
          input: expect.objectContaining({ company: 'Acme Corp', role: 'Engineer' }),
        }),
      );
    });
  });

  it('navigates to application detail after successful creation', async () => {
    mockGqlRequest.mockResolvedValue({ createApplication: { id: 'new-1' } });
    render(<NewApplicationPage />);

    fireEvent.change(screen.getByPlaceholderText('Acme Corp'), {
      target: { value: 'Acme Corp' },
    });
    fireEvent.change(screen.getByPlaceholderText('Senior Engineer'), {
      target: { value: 'Engineer' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({ to: '/applications/$applicationId' }),
      );
    });
  });

  it('offers the plan page when the application limit is reached (JEF-344)', async () => {
    mockGqlRequest.mockRejectedValue({
      response: {
        errors: [
          {
            message: 'You have reached the maximum of 50 applications',
            extensions: { code: 'QUOTA_EXCEEDED' },
          },
        ],
      },
    });
    render(<NewApplicationPage />);

    fireEvent.change(screen.getByPlaceholderText('Acme Corp'), { target: { value: 'Acme Corp' } });
    fireEvent.change(screen.getByPlaceholderText('Senior Engineer'), {
      target: { value: 'Engineer' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText(/maximum of 50 applications/)).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'See what Pro includes' })).toHaveAttribute(
      'href',
      '/settings/plan',
    );
  });

  it('shows error on API failure', async () => {
    mockGqlRequest.mockRejectedValue(new Error('network error'));
    render(<NewApplicationPage />);

    fireEvent.change(screen.getByPlaceholderText('Acme Corp'), {
      target: { value: 'Acme Corp' },
    });
    fireEvent.change(screen.getByPlaceholderText('Senior Engineer'), {
      target: { value: 'Engineer' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
