import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { NotificationsPage } from '#/features/notifications/pages/NotificationsPage';
import { gqlText, gqlContaining } from '#/__tests__/helpers/gqlText';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

const notification1 = {
  id: 'n-1',
  type: 'interview_reminder',
  title: 'Upcoming interview: Acme',
  body: 'Phone interview tomorrow at 10am',
  url: '/applications/app-1',
  read: false,
  createdAt: new Date().toISOString(),
};

const notification2 = {
  id: 'n-2',
  type: 'security_alert',
  title: 'New sign-in detected',
  body: 'Chrome on macOS signed in',
  url: '/settings/security',
  read: true,
  createdAt: new Date().toISOString(),
};

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGqlRequest.mockImplementation((query: string) => {
      if (gqlText(query).includes('NotificationsPage')) {
        return Promise.resolve({
          notificationsPage: {
            hasNextPage: false,
            nextCursor: null,
            items: [notification1, notification2],
          },
        });
      }
      return Promise.resolve({});
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the page heading and lists notifications', async () => {
    render(<NotificationsPage />, { wrapper: Wrapper });

    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Upcoming interview: Acme')).toBeInTheDocument();
    });
    expect(screen.getByText('New sign-in detected')).toBeInTheDocument();
  });

  it('shows an empty state when there are no notifications', async () => {
    mockGqlRequest.mockResolvedValue({
      notificationsPage: { hasNextPage: false, nextCursor: null, items: [] },
    });

    render(<NotificationsPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
    });
  });

  it('selects all and marks them read via the bulk toolbar', async () => {
    render(<NotificationsPage />, { wrapper: Wrapper });
    await screen.findByText('Upcoming interview: Acme');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark read' }));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('MarkNotificationsRead'), {
        ids: ['n-1', 'n-2'],
        isRead: true,
      });
    });
  });

  it('marks unread via the bulk toolbar', async () => {
    render(<NotificationsPage />, { wrapper: Wrapper });
    await screen.findByText('Upcoming interview: Acme');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select New sign-in detected' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark unread' }));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('MarkNotificationsRead'), {
        ids: ['n-2'],
        isRead: false,
      });
    });
  });

  it('marks an unread notification read and navigates when its row is clicked', async () => {
    const originalLocation = window.location;
    vi.stubGlobal('location', { ...originalLocation, href: '' });

    render(<NotificationsPage />, { wrapper: Wrapper });
    await screen.findByText('Upcoming interview: Acme');

    fireEvent.click(screen.getByText('Upcoming interview: Acme'));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('MarkNotificationsRead'), {
        ids: ['n-1'],
        isRead: true,
      });
    });
    expect(window.location.href).toBe('/applications/app-1');
    vi.unstubAllGlobals();
  });

  it('does not re-mark an already-read notification when its row is clicked', async () => {
    vi.stubGlobal('location', { ...window.location, href: '' });

    render(<NotificationsPage />, { wrapper: Wrapper });
    await screen.findByText('New sign-in detected');

    fireEvent.click(screen.getByText('New sign-in detected'));

    await waitFor(() => {
      expect(window.location.href).toBe('/settings/security');
    });
    expect(mockGqlRequest).not.toHaveBeenCalledWith(
      gqlContaining('MarkNotificationsRead'),
      expect.anything(),
    );
    vi.unstubAllGlobals();
  });
});
