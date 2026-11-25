import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { CalendarPage } from '../CalendarPage';

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

  describe('the side panel and legend (JEF-693)', () => {
    const event = (id: string, company: string, day: number) => ({
      id,
      applicationId: `app-${id}`,
      company,
      role: 'Engineer',
      type: 'followUp' as const,
      date: localNoonISO(2024, 6, day),
      interviewRoundType: null,
    });

    it('lists the next 7 days, soonest first, until a day is picked', async () => {
      mockGqlRequest.mockResolvedValue({
        calendarEvents: [
          event('3', 'Later Co', 20),
          event('1', 'Soon Co', 16),
          event('2', 'Today Co', 15),
          event('4', 'Past Co', 10),
        ],
      });
      render(<CalendarPage />, { wrapper: Wrapper });

      const panel = await screen.findByRole('region', { name: 'Next 7 days' });
      const text = panel.textContent ?? '';
      expect(text.indexOf('Today Co')).toBeGreaterThan(-1);
      expect(text.indexOf('Today Co')).toBeLessThan(text.indexOf('Soon Co'));
      expect(text.indexOf('Soon Co')).toBeLessThan(text.indexOf('Later Co'));
      expect(text).not.toContain('Past Co');
    });

    it('leaves out an event more than 7 days away', async () => {
      mockGqlRequest.mockResolvedValue({ calendarEvents: [event('1', 'Far Co', 25)] });
      render(<CalendarPage />, { wrapper: Wrapper });

      expect(await screen.findByText('Nothing in the next 7 days.')).toBeInTheDocument();
      expect(screen.queryByText(/Far Co/)).not.toBeInTheDocument();
    });

    it("replaces the list with the day's own events once a day is picked", async () => {
      mockGqlRequest.mockResolvedValue({
        calendarEvents: [event('1', 'Soon Co', 16), event('2', 'Other Co', 18)],
      });
      render(<CalendarPage />, { wrapper: Wrapper });

      await screen.findByText(/Soon Co/);
      fireEvent.click(screen.getByText('16'));

      await waitFor(() => expect(screen.queryByText(/Other Co/)).not.toBeInTheDocument());
      expect(screen.getByText(/Soon Co/)).toBeInTheDocument();
      expect(screen.queryByText('Next 7 days')).not.toBeInTheDocument();
    });

    it('names the three dot colours in a legend', async () => {
      mockGqlRequest.mockResolvedValue({ calendarEvents: [] });
      render(<CalendarPage />, { wrapper: Wrapper });

      const legend = await screen.findByTestId('calendar-legend');
      expect(legend).toHaveTextContent('Applied');
      expect(legend).toHaveTextContent('Follow up');
      expect(legend).toHaveTextContent('Interview');
      expect(legend.querySelectorAll('li')).toHaveLength(3);
    });

    it('uses the width of a wide screen, not a narrow centred column', async () => {
      mockGqlRequest.mockResolvedValue({ calendarEvents: [] });
      const { container } = render(<CalendarPage />, { wrapper: Wrapper });

      await screen.findByTestId('calendar-legend');
      const page = container.firstElementChild as HTMLElement;
      expect(page.className).toContain('max-w-6xl');
      expect(page.className).not.toContain('max-w-3xl');
    });
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
