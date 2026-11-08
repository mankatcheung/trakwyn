import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...rest
  }: { children: ReactNode; to: string } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import {
  NotificationInboxButton,
  NotificationInboxLink,
} from '#/routes/_authenticated/-notification-inbox';

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

function mockResponses({
  unreadCount = 2,
  items = [notification1, notification2],
}: {
  unreadCount?: number;
  items?: (typeof notification1)[];
} = {}) {
  mockGqlRequest.mockImplementation((query: string) => {
    if (query.includes('UnreadNotificationCount')) {
      return Promise.resolve({ unreadNotificationCount: unreadCount });
    }
    if (query.includes('NotificationsPage')) {
      return Promise.resolve({
        notificationsPage: { hasNextPage: false, nextCursor: null, items },
      });
    }
    return Promise.resolve({});
  });
}

describe('NotificationInboxLink (mobile)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResponses();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('links directly to the notifications page', async () => {
    render(<NotificationInboxLink />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /2 unread/i })).toHaveAttribute(
        'href',
        '/notifications',
      );
    });
  });

  it('has a plain aria-label with no unread count when there are no unread notifications', async () => {
    mockResponses({ unreadCount: 0 });

    render(<NotificationInboxLink />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Notifications' })).toBeInTheDocument();
    });
  });
});

describe('NotificationInboxButton (desktop popover)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResponses();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows an unread badge when there are unread notifications', async () => {
    render(<NotificationInboxButton />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /2 unread/i })).toBeInTheDocument();
    });
  });

  it('keeps the popover (and its notifications request) out until the bell is clicked', async () => {
    render(<NotificationInboxButton />, { wrapper: Wrapper });
    await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockGqlRequest).not.toHaveBeenCalledWith(
      expect.stringContaining('NotificationsPage'),
      expect.anything(),
    );

    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('opens a popover listing notifications on click, capped at 5', async () => {
    render(<NotificationInboxButton />, { wrapper: Wrapper });
    await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('NotificationsPage'),
        expect.objectContaining({ limit: 5 }),
      );
    });
    expect(await screen.findByText('Upcoming interview: Acme')).toBeInTheDocument();
    expect(screen.getByText('New sign-in detected')).toBeInTheDocument();
  });

  it('links to the full notifications page', async () => {
    render(<NotificationInboxButton />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole('button', { name: /notifications/i }));

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'View all notifications' })).toHaveAttribute(
        'href',
        '/notifications',
      );
    });
  });

  it('does not show bulk-select checkboxes in the popover', async () => {
    render(<NotificationInboxButton />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole('button', { name: /notifications/i }));
    await screen.findByText('Upcoming interview: Acme');

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no notifications', async () => {
    mockResponses({ unreadCount: 0, items: [] });

    render(<NotificationInboxButton />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole('button', { name: /notifications/i }));

    await waitFor(() => {
      expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
    });
  });

  it('closes the popover on Escape', async () => {
    render(<NotificationInboxButton />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole('button', { name: /notifications/i }));
    await screen.findByText('Upcoming interview: Acme');

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByText('Upcoming interview: Acme')).not.toBeInTheDocument();
    });
  });

  it('closes the popover when clicking outside', async () => {
    render(
      <div>
        <div data-testid="outside">outside</div>
        <NotificationInboxButton />
      </div>,
      { wrapper: Wrapper },
    );
    fireEvent.click(await screen.findByRole('button', { name: /notifications/i }));
    await screen.findByText('Upcoming interview: Acme');

    fireEvent.mouseDown(screen.getByTestId('outside'));

    await waitFor(() => {
      expect(screen.queryByText('Upcoming interview: Acme')).not.toBeInTheDocument();
    });
  });

  it('marks an unread notification read and navigates when its row is clicked', async () => {
    const originalLocation = window.location;
    vi.stubGlobal('location', { ...originalLocation, href: '' });

    render(<NotificationInboxButton />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole('button', { name: /notifications/i }));
    await screen.findByText('Upcoming interview: Acme');

    fireEvent.click(screen.getByText('Upcoming interview: Acme'));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('MarkNotificationsRead'),
        {
          ids: ['n-1'],
          isRead: true,
        },
      );
    });
    expect(window.location.href).toBe('/applications/app-1');
    vi.unstubAllGlobals();
  });

  it('does not re-mark an already-read notification when its row is clicked', async () => {
    vi.stubGlobal('location', { ...window.location, href: '' });

    render(<NotificationInboxButton />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole('button', { name: /notifications/i }));
    await screen.findByText('New sign-in detected');

    fireEvent.click(screen.getByText('New sign-in detected'));

    await waitFor(() => {
      expect(window.location.href).toBe('/settings/security');
    });
    expect(mockGqlRequest).not.toHaveBeenCalledWith(
      expect.stringContaining('MarkNotificationsRead'),
      expect.anything(),
    );
    vi.unstubAllGlobals();
  });
});
