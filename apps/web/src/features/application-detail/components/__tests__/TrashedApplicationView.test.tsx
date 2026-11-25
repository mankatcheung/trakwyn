import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatDay } from '#/lib/dates';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { TrashedApplicationView } from '#/features/application-detail/components/TrashedApplicationView';
import type { Application } from '#/features/application-detail/graphql/applicationQuery';

const { mockGqlRequest, mockNavigate, mockToast } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockNavigate: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));
vi.mock('sonner', () => ({ toast: mockToast }));

const app: Application = {
  id: 'app-1',
  company: 'Acme',
  role: 'Engineer',
  status: 'applied',
  starred: false,
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: '2026-06-01T00:00:00.000Z',
};

function renderView(overrides: Partial<Application> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TrashedApplicationView app={{ ...app, ...overrides }} />
    </QueryClientProvider>,
  );
}

const gqlError = (message: string) => ({
  response: { errors: [{ message, extensions: { code: 'VALIDATION_ERROR' } }] },
});

const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  mockGqlRequest.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TrashedApplicationView', () => {
  it('shows the company, role and a way back to Trash', () => {
    renderView();

    expect(screen.getByRole('heading', { name: 'Acme' })).toBeInTheDocument();
    expect(screen.getByText('Engineer')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to Trash/ })).toHaveAttribute(
      'href',
      '/applications/trash',
    );
  });

  it.each([
    [null, 'It will be permanently removed after the retention period.'],
    [3, 'Deletes in 3 days'],
  ])('words the countdown for purgeAt %s', (days, text) => {
    renderView({ purgeAt: days === null ? null : daysFromNow(days - 0.5) });

    expect(screen.getByRole('status')).toHaveTextContent(text);
  });

  it('says the application is deleted today when the window has run out', () => {
    renderView({ purgeAt: daysFromNow(-1) });

    expect(screen.getByRole('status')).toHaveTextContent('Deletes today');
  });

  it('shows only the facts the application has', () => {
    renderView({
      location: 'Berlin',
      salaryRange: '€80k',
      source: 'LinkedIn',
      appliedAt: '2026-03-04T12:00:00.000Z',
      description: 'Build things',
    });

    expect(screen.getByText('Berlin')).toBeInTheDocument();
    expect(screen.getByText('€80k')).toBeInTheDocument();
    expect(screen.getByText('LinkedIn')).toBeInTheDocument();
    expect(screen.getByText(formatDay('2026-03-04T12:00:00.000Z', 'en'))).toBeInTheDocument();
    expect(screen.getByText('Build things')).toBeInTheDocument();
  });

  it('renders no facts or description when there are none', () => {
    renderView();

    expect(screen.queryByRole('term')).not.toBeInTheDocument();
    expect(screen.queryByText('Build things')).not.toBeInTheDocument();
  });

  it('restores the application and says so', async () => {
    renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Application restored'));
    expect(mockGqlRequest).toHaveBeenCalledWith(expect.anything(), { id: 'app-1' });
  });

  it('shows the error when restoring fails', async () => {
    mockGqlRequest.mockRejectedValueOnce(gqlError('Restore failed'));
    renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Restore failed'));
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('does nothing when the permanent delete is not confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Acme'));
    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('deletes forever once confirmed, then leaves for Trash', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/applications/trash' }));
    expect(mockToast.success).toHaveBeenCalledWith('Application permanently deleted');
  });

  it('shows the error when the permanent delete fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockGqlRequest.mockRejectedValueOnce(gqlError('Nope'));
    renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Nope'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('disables both actions while one is in flight', async () => {
    mockGqlRequest.mockReturnValue(new Promise(() => {}));
    renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Restore' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Delete forever' })).toBeDisabled();
  });
});
