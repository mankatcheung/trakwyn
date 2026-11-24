import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRef, type ReactNode } from 'react';
import { NotificationPopover } from '#/features/notifications/components/NotificationPopover';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, onClick }: { children: ReactNode; to: string; onClick?: () => void }) => (
    <a href={to} onClick={onClick}>
      {children}
    </a>
  ),
}));
vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));

const NOW = new Date('2026-06-10T12:00:00.000Z');
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

const item = (overrides: Record<string, unknown> = {}) => ({
  id: 'n1',
  type: 'interview_reminder',
  title: 'Upcoming interview',
  body: 'Tomorrow at 10',
  url: null,
  read: false,
  createdAt: ago(5),
  ...overrides,
});

const page = (items: unknown[]) => ({
  notificationsPage: { items, hasNextPage: false, nextCursor: null },
});

const originalLocation = window.location;

function setup(items: unknown[] | Error | 'pending' = [item()]) {
  mockGqlRequest.mockImplementation((_doc: unknown, vars?: Record<string, unknown>) => {
    if (vars && 'ids' in vars) return Promise.resolve({ markNotificationsRead: true });
    if (items === 'pending') return new Promise(() => {});
    if (items instanceof Error) return Promise.reject(items);
    return Promise.resolve(page(items));
  });
  const anchor = document.createElement('button');
  document.body.appendChild(anchor);
  const anchorRef = createRef<HTMLElement>();
  (anchorRef as { current: HTMLElement }).current = anchor;
  const onClose = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <NotificationPopover anchorRef={anchorRef} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose, anchor, ...view };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, href: 'http://localhost/' },
  });
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  document.querySelectorAll('body > button').forEach((el) => el.remove());
});

describe('NotificationPopover', () => {
  it('is a dialog titled Notifications with a link to all of them', async () => {
    const { onClose } = setup();

    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
    await screen.findByText('Upcoming interview');
    fireEvent.click(screen.getByRole('link', { name: 'View all notifications' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'View all notifications' })).toHaveAttribute(
      'href',
      '/notifications',
    );
  });

  it('is portaled to the body, outside the render container', () => {
    const { container } = setup();

    expect(container).not.toContainElement(screen.getByRole('dialog'));
    expect(document.body).toContainElement(screen.getByRole('dialog'));
  });

  it('shows placeholders while loading', () => {
    setup('pending');

    expect(screen.queryByText("You're all caught up.")).not.toBeInTheDocument();
    expect(screen.queryByText('Failed to load notifications.')).not.toBeInTheDocument();
  });

  it('says so when the load fails', async () => {
    setup(new Error('boom'));

    expect(await screen.findByText('Failed to load notifications.')).toBeInTheDocument();
    expect(screen.queryByText("You're all caught up.")).not.toBeInTheDocument();
  });

  it('says the user is caught up when there is nothing', async () => {
    setup([]);

    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();
  });

  it('asks for the five most recent', async () => {
    setup();
    await screen.findByText('Upcoming interview');

    expect(mockGqlRequest).toHaveBeenCalledWith(expect.anything(), { limit: 5 });
  });

  it('shows how long ago each arrived, and tells unread from read', async () => {
    setup([
      item({ id: 'a', title: 'Fresh', createdAt: ago(0) }),
      item({ id: 'b', title: 'Minutes', createdAt: ago(5), read: true }),
      item({ id: 'c', title: 'Hours', createdAt: ago(180) }),
      item({ id: 'd', title: 'Days', createdAt: ago(3 * 24 * 60), read: true }),
    ]);

    await screen.findByText('Fresh');
    expect(screen.getByText('just now')).toBeInTheDocument();
    expect(screen.getByText('5m ago')).toBeInTheDocument();
    expect(screen.getByText('3h ago')).toBeInTheDocument();
    expect(screen.getByText('3d ago')).toBeInTheDocument();
    expect(screen.getByText('Fresh')).toHaveClass('font-medium');
    expect(screen.getByText('Minutes')).not.toHaveClass('font-medium');
  });

  it('marks an unread notification read, closes, and opens its address', async () => {
    const { onClose } = setup([item({ url: '/applications/app-1' })]);

    fireEvent.click(await screen.findByRole('button', { name: /Upcoming interview/ }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(window.location.href).toBe('/applications/app-1');
    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.anything(), {
        ids: ['n1'],
        isRead: true,
      }),
    );
  });

  it('leaves a read notification as it is, and goes nowhere without an address', async () => {
    const { onClose } = setup([item({ read: true, url: null })]);

    fireEvent.click(await screen.findByRole('button', { name: /Upcoming interview/ }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(window.location.href).toBe('http://localhost/');
    expect(mockGqlRequest).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ids: expect.anything() }),
    );
  });

  it('closes on Escape', () => {
    const { onClose } = setup();

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('closes on a press outside, but not on the panel or the bell', () => {
    const { onClose, anchor } = setup();

    fireEvent.mouseDown(screen.getByRole('dialog'));
    fireEvent.mouseDown(anchor);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('stops listening for presses once it is gone', () => {
    const { onClose, unmount } = setup();
    unmount();

    act(() => {
      fireEvent.mouseDown(document.body);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('sits below its anchor once measured', () => {
    const anchor = document.createElement('button');
    anchor.getBoundingClientRect = () =>
      ({ top: 0, bottom: 40, left: 20, right: 60, width: 40, height: 40 }) as DOMRect;
    document.body.appendChild(anchor);
    const anchorRef = { current: anchor };
    mockGqlRequest.mockResolvedValue(page([]));
    const client = new QueryClient();

    render(
      <QueryClientProvider client={client}>
        <NotificationPopover anchorRef={anchorRef} onClose={() => {}} />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('dialog')).toHaveStyle({ top: '48px', left: '20px' });
  });
});
