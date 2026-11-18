import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest, mockToastSuccess, mockToastError, mockToastWarning } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockToastWarning: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: React.ReactNode;
    to: string;
    params?: Record<string, string>;
  }) => <a href={`${to}${params ? '/' + Object.values(params).join('/') : ''}`}>{children}</a>,
  useNavigate: () => vi.fn(),
}));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError, warning: mockToastWarning },
}));

import { TrashPage } from '#/features/applications/pages/TrashPage';
import { daysUntilPurge } from '#/features/applications/graphql/trashQueries';
import { gqlText, gqlContaining } from '#/__tests__/helpers/gqlText';

const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

const NOW = new Date('2026-08-20T12:00:00.000Z');

const second = {
  id: 'app-2',
  company: 'Globex',
  role: 'Designer',
  status: 'applied',
  location: null,
  appliedAt: null,
  deletedAt: '2026-08-16T12:00:00.000Z',
  purgeAt: '2026-09-15T12:00:00.000Z',
};

const trashed = {
  id: 'app-1',
  company: 'Stripe',
  role: 'Software Engineer',
  status: 'applied',
  location: 'Remote',
  appliedAt: '2026-07-01T00:00:00.000Z',
  deletedAt: '2026-08-15T12:00:00.000Z',
  // 30-day retention from deletedAt → 25 days left at NOW.
  purgeAt: '2026-09-14T12:00:00.000Z',
};

describe('daysUntilPurge', () => {
  it('rounds a partial day up so the final hours still read as a whole day', () => {
    expect(daysUntilPurge('2026-08-21T06:00:00.000Z', NOW)).toBe(1);
  });

  it('clamps to 0 once the purge instant has passed', () => {
    expect(daysUntilPurge('2026-08-19T12:00:00.000Z', NOW)).toBe(0);
  });

  it('returns null when there is no purge date', () => {
    expect(daysUntilPurge(null, NOW)).toBeNull();
  });
});

describe('TrashPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists trashed applications with a countdown to permanent deletion', async () => {
    mockGqlRequest.mockResolvedValue({ trashedApplications: [trashed] });
    render(<TrashPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());
    expect(screen.getByText('Software Engineer')).toBeInTheDocument();
    expect(screen.getByText('Deletes in 25 days')).toBeInTheDocument();
  });

  it('shows an empty state when nothing is in Trash', async () => {
    mockGqlRequest.mockResolvedValue({ trashedApplications: [] });
    render(<TrashPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Trash is empty')).toBeInTheDocument());
  });

  it('restores an application', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (gqlText(query).includes('RestoreApplication'))
        return Promise.resolve({ restoreApplication: true });
      return Promise.resolve({ trashedApplications: [trashed] });
    });
    render(<TrashPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Restore Stripe'));

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('RestoreApplication'), {
        id: 'app-1',
      }),
    );
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it('does not permanently delete when the confirmation is declined', async () => {
    mockGqlRequest.mockResolvedValue({ trashedApplications: [trashed] });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<TrashPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Permanently delete Stripe'));

    expect(window.confirm).toHaveBeenCalled();
    expect(mockGqlRequest).not.toHaveBeenCalledWith(
      gqlContaining('PermanentlyDeleteApplication'),
      expect.anything(),
    );
  });

  it('permanently deletes once confirmed', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (gqlText(query).includes('PermanentlyDeleteApplication'))
        return Promise.resolve({ permanentlyDeleteApplication: true });
      return Promise.resolve({ trashedApplications: [trashed] });
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<TrashPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Permanently delete Stripe'));

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('PermanentlyDeleteApplication'), {
        id: 'app-1',
      }),
    );
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it('surfaces a load failure with a retry instead of an empty Trash', async () => {
    mockGqlRequest.mockRejectedValue(new Error('network down'));
    render(<TrashPage />, { wrapper: Wrapper });

    // getErrorMessage maps an unrecognized failure to a friendly string, so the
    // retry affordance is what distinguishes "failed" from "nothing in Trash".
    await waitFor(() => expect(screen.getByText('Try again')).toBeInTheDocument());
    expect(screen.queryByText('Trash is empty')).not.toBeInTheDocument();
  });
});

describe('TrashPage — bulk actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const listOf = (...items: unknown[]) => ({ trashedApplications: items });

  it('restores a selection in one call', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (gqlText(query).includes('BulkRestoreApplications'))
        return Promise.resolve({ bulkRestoreApplications: { restored: 2 } });
      return Promise.resolve(listOf(trashed, second));
    });
    render(<TrashPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Select all'));
    fireEvent.click(screen.getByRole('button', { name: 'Restore selected' }));

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('BulkRestoreApplications'), {
        ids: ['app-1', 'app-2'],
      }),
    );
    expect(mockToastSuccess).toHaveBeenCalledWith('2 applications restored');
  });

  it('sends only the rows that are actually selected', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (gqlText(query).includes('BulkRestoreApplications'))
        return Promise.resolve({ bulkRestoreApplications: { restored: 1 } });
      return Promise.resolve(listOf(trashed, second));
    });
    render(<TrashPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Globex')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Select Globex'));
    fireEvent.click(screen.getByRole('button', { name: 'Restore selected' }));

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('BulkRestoreApplications'), {
        ids: ['app-2'],
      }),
    );
  });

  it('offers no Empty Trash button when there is nothing to empty', async () => {
    mockGqlRequest.mockResolvedValue(listOf());
    render(<TrashPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Trash is empty')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Empty Trash' })).not.toBeInTheDocument();
  });

  it('names the count in the confirmation rather than warning generically', async () => {
    mockGqlRequest.mockResolvedValue(listOf(trashed, second));
    render(<TrashPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Empty Trash' }));

    expect(await screen.findByText('Permanently delete all 2 applications?')).toBeInTheDocument();
  });

  it('puts focus on Cancel so a stray Enter cannot empty the Trash', async () => {
    mockGqlRequest.mockResolvedValue(listOf(trashed, second));
    render(<TrashPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Empty Trash' }));

    const cancel = await screen.findByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    expect(mockGqlRequest).not.toHaveBeenCalledWith(gqlContaining('EmptyTrash'), expect.anything());
  });

  it('empties the Trash once confirmed and reports the count', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (gqlText(query).includes('EmptyTrash'))
        return Promise.resolve({ emptyTrash: { deleted: 2, failed: 0 } });
      return Promise.resolve(listOf(trashed, second));
    });
    render(<TrashPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Empty Trash' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete all 2 forever' }));

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('Trash emptied — 2 applications deleted'),
    );
  });

  it('says what actually happened when part of the Trash could not be deleted', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (gqlText(query).includes('EmptyTrash'))
        return Promise.resolve({ emptyTrash: { deleted: 1, failed: 1 } });
      return Promise.resolve(listOf(trashed, second));
    });
    render(<TrashPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Empty Trash' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete all 2 forever' }));

    await waitFor(() =>
      expect(mockToastWarning).toHaveBeenCalledWith('1 deleted, 1 could not be deleted'),
    );
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it('closes the confirmation without deleting when Cancel is pressed', async () => {
    mockGqlRequest.mockResolvedValue(listOf(trashed, second));
    render(<TrashPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Empty Trash' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByText('Permanently delete all 2 applications?')).not.toBeInTheDocument(),
    );
    expect(mockGqlRequest).not.toHaveBeenCalledWith(gqlContaining('EmptyTrash'), expect.anything());
  });
});
