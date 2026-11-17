import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...rest
  }: {
    children: React.ReactNode;
    to: string;
    [key: string]: unknown;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { KanbanBoard } from '#/features/applications/pages/BoardPage';
import { APPLICATION_STATUSES, STATUS_COLORS } from '#/features/applications/lib/statusColors';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

const app = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'app-1',
  company: 'Acme',
  role: 'Engineer',
  status: 'applied',
  location: 'Remote',
  appliedAt: '2024-01-01T00:00:00.000Z',
  starred: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  tags: [] as string[],
  likelyGhosted: false,
  boardPosition: 0,
  ...overrides,
});

describe('KanbanBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('shows an error state with a retry action when the query fails', async () => {
    mockGqlRequest.mockRejectedValue(new Error('Network error'));
    render(<KanbanBoard />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });
  });

  it('renders all status columns with zero counts when there are no applications', async () => {
    mockGqlRequest.mockResolvedValue({ applications: [] });
    render(<KanbanBoard />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeInTheDocument();
    });
    for (const status of [
      'Draft',
      'Applied',
      'Interviewing',
      'Offered',
      'Accepted',
      'Rejected',
      'Withdrawn',
    ]) {
      expect(screen.getByText(status)).toBeInTheDocument();
    }
  });

  it('places each application card into its matching status column', async () => {
    mockGqlRequest.mockResolvedValue({
      applications: [
        app({ id: '1', company: 'Acme', status: 'applied' }),
        app({ id: '2', company: 'Globex', status: 'interviewing' }),
      ],
    });
    render(<KanbanBoard />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Acme')).toBeInTheDocument();
    });
    expect(screen.getByText('Globex')).toBeInTheDocument();
  });

  it('refetches applications when the board is remounted', async () => {
    mockGqlRequest.mockResolvedValue({ applications: [app()] });
    const client = makeClient();
    const view = render(
      <QueryClientProvider client={client}>
        <KanbanBoard />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText('Acme')).toBeInTheDocument());
    view.unmount();

    render(
      <QueryClientProvider client={client}>
        <KanbanBoard />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(mockGqlRequest).toHaveBeenCalledTimes(2));
  });

  it('shows the "Likely ghosted" badge for a flagged application', async () => {
    mockGqlRequest.mockResolvedValue({
      applications: [app({ id: '1', likelyGhosted: true })],
    });
    render(<KanbanBoard />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Likely ghosted')).toBeInTheDocument();
    });
  });

  it('renders cards within a column in boardPosition order', async () => {
    mockGqlRequest.mockResolvedValue({
      applications: [
        app({ id: '1', company: 'Acme', status: 'applied', boardPosition: 1 }),
        app({ id: '2', company: 'Globex', status: 'applied', boardPosition: 2 }),
        app({ id: '3', company: 'Initech', status: 'applied', boardPosition: 0 }),
      ],
    });
    render(<KanbanBoard />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Initech')).toBeInTheDocument();
    });

    const order = screen
      .getAllByText(/^(Acme|Globex|Initech)$/)
      .map((element) => element.textContent);
    expect(order).toEqual(['Initech', 'Acme', 'Globex']);
  });

  it('falls back to newest-first when positions tie', async () => {
    // Nothing has been dragged yet, so every card still sits at 0 — the board
    // has to look exactly as it did before ranks existed.
    mockGqlRequest.mockResolvedValue({
      applications: [
        app({
          id: '1',
          company: 'Acme',
          status: 'applied',
          createdAt: '2024-01-01T00:00:00.000Z',
        }),
        app({
          id: '2',
          company: 'Globex',
          status: 'applied',
          createdAt: '2024-06-01T00:00:00.000Z',
        }),
      ],
    });
    render(<KanbanBoard />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Acme')).toBeInTheDocument();
    });

    const order = screen.getAllByText(/^(Acme|Globex)$/).map((element) => element.textContent);
    expect(order).toEqual(['Globex', 'Acme']);
  });

  it('gives every column header a status-coloured dot alongside its label', async () => {
    mockGqlRequest.mockResolvedValue({ applications: [] });
    render(<KanbanBoard />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeInTheDocument();
    });

    for (const status of APPLICATION_STATUSES) {
      const dot = screen.getByTestId(`column-dot-${status}`);
      expect(dot).toHaveClass(STATUS_COLORS[status].dot);
      // The dot is decoration; the label still carries the meaning.
      expect(dot).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('tints the column heading to match its status', async () => {
    mockGqlRequest.mockResolvedValue({ applications: [] });
    render(<KanbanBoard />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Interviewing')).toBeInTheDocument();
    });

    expect(screen.getByText('Interviewing').className).toContain('text-purple-700');
    expect(screen.getByText('Offered').className).toContain('text-orange-700');
  });

  it('links "New" to the new application route', async () => {
    mockGqlRequest.mockResolvedValue({ applications: [] });
    render(<KanbanBoard />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /new application/i })).toHaveAttribute(
        'href',
        '/applications/new',
      );
    });
  });

  it('hides card fields toggled off in the display picker (JEF-230)', async () => {
    mockGqlRequest.mockResolvedValue({
      applications: [app({ location: 'Remote', role: 'Engineer' })],
    });
    render(<KanbanBoard />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Acme')).toBeInTheDocument();
    });
    expect(screen.getByText('Engineer')).toBeInTheDocument();
    expect(screen.getByText('Remote')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Choose which details are shown' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Role' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Location' }));

    // Company stays; the toggled fields disappear from the card. Column
    // headings keep their own localized status labels regardless of the
    // per-card status badge setting.
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.queryByText('Engineer')).not.toBeInTheDocument();
    expect(screen.queryByText('Remote')).not.toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem('applications.displayFields') ?? '{}') as Record<
      string,
      boolean
    >;
    expect(stored.role).toBe(false);
    expect(stored.location).toBe(false);
  });
});
