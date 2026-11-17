import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentType } from 'react';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: object) => ({ ...opts, useSearch: () => ({}) }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { Route } from '#/routes/_authenticated/calendar';

const CalendarPage = (Route as unknown as { component: ComponentType }).component;

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

const localNoonISO = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString();

describe('CalendarPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2024, 5, 15, 9));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows an error state with a retry action when the query fails', async () => {
    mockGqlRequest.mockRejectedValue(new Error('Network error'));
    render(<CalendarPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });
  });

  it('renders the month grid with a placeholder before selecting a day', async () => {
    mockGqlRequest.mockResolvedValue({ calendarEvents: [] });
    render(<CalendarPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Sun')).toBeInTheDocument();
    });
    expect(screen.getByText('Select a day to see its events.')).toBeInTheDocument();
  });

  it('shows events for a selected day', async () => {
    mockGqlRequest.mockResolvedValue({
      calendarEvents: [
        {
          id: 'ev-1',
          applicationId: 'app-1',
          company: 'Acme',
          role: 'Engineer',
          type: 'applied',
          date: localNoonISO(2024, 6, 15),
          interviewRoundType: null,
        },
      ],
    });
    render(<CalendarPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Select a day to see its events.')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '15' }));

    await waitFor(() => {
      expect(screen.getByText(/Applied — Acme/)).toBeInTheDocument();
    });
    expect(screen.getByText('Engineer')).toBeInTheDocument();
  });

  it('shows "No events on this day." for a day with no events', async () => {
    mockGqlRequest.mockResolvedValue({ calendarEvents: [] });
    render(<CalendarPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Sun')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '15' }));

    await waitFor(() => {
      expect(screen.getByText('No events on this day.')).toBeInTheDocument();
    });
  });

  it('shows events for the current day immediately when switching to Day view', async () => {
    mockGqlRequest.mockResolvedValue({
      calendarEvents: [
        {
          id: 'ev-1',
          applicationId: 'app-1',
          company: 'Globex',
          role: 'Designer',
          type: 'interview',
          date: localNoonISO(2024, 6, 15),
          interviewRoundType: 'onsite',
        },
      ],
    });
    render(<CalendarPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Select a day to see its events.')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Day' }));

    await waitFor(() => {
      expect(screen.getByText(/Interview \(onsite\) — Globex/)).toBeInTheDocument();
    });
  });

  it('navigates to the next month and updates the period label', async () => {
    mockGqlRequest.mockResolvedValue({ calendarEvents: [] });
    render(<CalendarPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('June 2024')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /next month/i }));

    await waitFor(() => {
      expect(screen.getByText('July 2024')).toBeInTheDocument();
    });
  });
});
