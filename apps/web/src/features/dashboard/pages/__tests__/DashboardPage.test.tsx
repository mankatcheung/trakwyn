import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: unknown) => opts,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { DashboardPage } from '#/features/dashboard/pages/DashboardPage';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton initially', () => {
    mockGqlRequest.mockReturnValue(new Promise(() => {}));
    render(<DashboardPage />, { wrapper: Wrapper });
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('shows empty state when no applications', async () => {
    mockGqlRequest.mockResolvedValue({ applications: [] });
    render(<DashboardPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('No applications yet.')).toBeInTheDocument();
    });
  });

  it('renders stat cards with correct counts', async () => {
    mockGqlRequest.mockResolvedValue({
      applications: [
        { id: '1', company: 'A', role: 'Dev', status: 'applied', createdAt: '2024-01-01' },
        { id: '2', company: 'B', role: 'Eng', status: 'interviewing', createdAt: '2024-01-02' },
        { id: '3', company: 'C', role: 'SWE', status: 'offered', createdAt: '2024-01-03' },
        { id: '4', company: 'D', role: 'IC', status: 'applied', createdAt: '2024-01-04' },
      ],
    });
    render(<DashboardPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument();
    });

    // Total count = 4
    expect(screen.getByText('4')).toBeInTheDocument();
    // Applied count = 2, Interviewing = 1, Offered = 1
    // Multiple "1" values on screen — use getAllByText
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
  });

  it('renders application list with company names', async () => {
    mockGqlRequest.mockResolvedValue({
      applications: [
        { id: '1', company: 'Stripe', role: 'SWE', status: 'applied', createdAt: '2024-01-01' },
        { id: '2', company: 'Vercel', role: 'Frontend', status: 'draft', createdAt: '2024-01-02' },
      ],
    });
    render(<DashboardPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Stripe')).toBeInTheDocument();
      expect(screen.getByText('Vercel')).toBeInTheDocument();
    });
  });

  it('renders stat card labels', async () => {
    mockGqlRequest.mockResolvedValue({ applications: [] });
    render(<DashboardPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Total')).toBeInTheDocument();
      expect(screen.getByText('Applied')).toBeInTheDocument();
      expect(screen.getByText('Interviewing')).toBeInTheDocument();
      expect(screen.getByText('Offered')).toBeInTheDocument();
    });
  });

  it('gives the weekly goal progressbar an accessible name', async () => {
    mockGqlRequest.mockImplementation((document: unknown) => {
      // A typed document is an AST, not a string; its JSON carries the names.
      const query = JSON.stringify(document);
      if (query.includes('WeeklyApplicationGoal')) {
        return Promise.resolve({
          weeklyApplicationGoal: { currentWeekCount: 2, weeklyApplicationGoal: 5, streakWeeks: 1 },
        });
      }
      if (query.includes('calendarEvents')) return Promise.resolve({ calendarEvents: [] });
      return Promise.resolve({ applications: [] });
    });
    render(<DashboardPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(
        screen.getByRole('progressbar', { name: '2 of 5 applications this week' }),
      ).toBeInTheDocument();
    });
  });

  describe('the weekly goal (JEF-693)', () => {
    function serveGoal(goal: { currentWeekCount: number; streakWeeks: number }) {
      mockGqlRequest.mockImplementation((document: unknown) => {
        const query = JSON.stringify(document);
        if (query.includes('WeeklyApplicationGoal')) {
          return Promise.resolve({
            weeklyApplicationGoal: { weeklyApplicationGoal: 5, ...goal },
          });
        }
        if (query.includes('calendarEvents')) return Promise.resolve({ calendarEvents: [] });
        return Promise.resolve({ applications: [] });
      });
      render(<DashboardPage />, { wrapper: Wrapper });
    }

    it('says "2-week streak", and shows nothing for a streak of zero', async () => {
      serveGoal({ currentWeekCount: 2, streakWeeks: 2 });
      expect(await screen.findByText('2-week streak')).toBeInTheDocument();
    });

    it('hides the streak at zero, not "0 weeks streak"', async () => {
      serveGoal({ currentWeekCount: 2, streakWeeks: 0 });
      await screen.findByRole('progressbar');
      expect(screen.queryByText(/streak/)).not.toBeInTheDocument();
    });

    it('fills the bar in the accent while the goal is open', async () => {
      serveGoal({ currentWeekCount: 2, streakWeeks: 1 });
      const open = (await screen.findByRole('progressbar')).firstChild as HTMLElement;
      expect(open.className).toContain('bg-blue-800');
    });

    it('goes quiet, with a check, once the goal is met', async () => {
      serveGoal({ currentWeekCount: 5, streakWeeks: 1 });
      const bar = (await screen.findByRole('progressbar')).firstChild as HTMLElement;
      expect(bar.className).toContain('bg-stone-400');
      expect(bar.className).not.toContain('bg-blue');
      expect(document.querySelector('svg.lucide-check')).not.toBeNull();
    });
  });

  it('lays the five stats out as a two-column grid on a phone, not a scrolling strip', async () => {
    mockGqlRequest.mockResolvedValue({ applications: [] });
    render(<DashboardPage />, { wrapper: Wrapper });

    const total = await screen.findByText('Total');
    const grid = total.closest('div.grid') as HTMLElement;
    expect(grid.className).toContain('grid-cols-2');
    expect(grid.className).not.toContain('overflow-x-auto');
  });

  it('renders an Upcoming section for future interviews and follow-ups only', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    mockGqlRequest.mockImplementation((document: unknown) => {
      // A typed document is an AST, not a string; its JSON carries the names.
      const query = JSON.stringify(document);
      if (query.includes('calendarEvents')) {
        return Promise.resolve({
          calendarEvents: [
            {
              id: 'e1',
              applicationId: '1',
              company: 'FutureCo',
              role: 'SWE',
              type: 'interview',
              date: future,
              interviewRoundType: 'technical',
            },
            {
              id: 'e2',
              applicationId: '2',
              company: 'PastCo',
              role: 'Eng',
              type: 'followUp',
              date: past,
              interviewRoundType: null,
            },
            {
              id: 'e3',
              applicationId: '3',
              company: 'AppliedCo',
              role: 'Eng',
              type: 'applied',
              date: future,
              interviewRoundType: null,
            },
          ],
        });
      }
      return Promise.resolve({ applications: [] });
    });
    render(<DashboardPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Upcoming')).toBeInTheDocument();
      expect(screen.getByText('FutureCo')).toBeInTheDocument();
    });
    expect(screen.queryByText('PastCo')).not.toBeInTheDocument();
    expect(screen.queryByText('AppliedCo')).not.toBeInTheDocument();
  });

  it('omits the Upcoming section when there are no future events', async () => {
    mockGqlRequest.mockResolvedValue({ applications: [], calendarEvents: [] });
    render(<DashboardPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('No applications yet.')).toBeInTheDocument();
    });
    expect(screen.queryByText('Upcoming')).not.toBeInTheDocument();
  });
});
