import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Section switching on the application detail page (JEF-611): a transition
// keeps the current section live while the next one renders, and the sections
// that hold typed state stay mounted inside `<Activity>`. The router mock is a
// tiny search store, as in ApplicationDetailPage.test.tsx, so a click really
// re-renders the page the way the router would.
const { mockNavigate, mockGqlRequest, searchStore } = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const store = {
    value: {} as { section?: string },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    get() {
      return store.value;
    },
    set(v: { section?: string }) {
      store.value = v;
      listeners.forEach((l) => l());
    },
  };
  return {
    mockGqlRequest: vi.fn(),
    searchStore: store,
    mockNavigate: vi.fn((opts?: { search?: { section?: string } }) => {
      if (opts?.search) store.set(opts.search);
    }),
  };
});

vi.mock('@tanstack/react-router', async () => {
  const React = await import('react');
  return {
    getRouteApi: () => ({
      useParams: () => ({ applicationId: 'app-test-id' }),
      useSearch: () =>
        React.useSyncExternalStore(searchStore.subscribe, searchStore.get, searchStore.get),
    }),
    useNavigate: () => mockNavigate,
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
  };
});

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { ApplicationDetailPage } from '#/features/application-detail/pages/ApplicationDetailPage';

const mockApp = {
  id: 'app-test-id',
  company: 'Stripe',
  role: 'Software Engineer',
  status: 'applied',
  jobUrl: null,
  location: null,
  salaryRange: null,
  description: null,
  appliedAt: '2024-03-01T00:00:00.000Z',
  starred: false,
  source: null,
  followUpAt: null,
  tags: [],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

let client: QueryClient;

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const countCalls = (name: string) =>
  mockGqlRequest.mock.calls.filter(([doc]) => typeof doc === 'string' && doc.includes(name)).length;

const loadApp = () =>
  mockGqlRequest.mockImplementation((query: string) => {
    if (query.includes('query Notes')) return Promise.resolve({ notes: [] });
    if (query.includes('query Contacts')) return Promise.resolve({ contacts: [] });
    return Promise.resolve({ application: mockApp });
  });

const nav = () => within(screen.getByLabelText('Section navigation'));

async function renderOpenOnNotes() {
  searchStore.set({ section: 'notes' });
  loadApp();
  render(<ApplicationDetailPage />, { wrapper: Wrapper });
  await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());
  await screen.findByPlaceholderText(/add a note/i);
}

describe('ApplicationDetailPage section switching (JEF-611)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchStore.set({});
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  it('keeps a half-typed note when you look at another section and come back', async () => {
    await renderOpenOnNotes();
    fireEvent.change(screen.getByPlaceholderText(/add a note/i), {
      target: { value: 'half typed draft' },
    });

    fireEvent.click(nav().getByRole('button', { name: /^contacts/i }));
    await waitFor(() =>
      expect(nav().getByRole('button', { name: /^contacts/i })).toHaveAttribute(
        'aria-current',
        'page',
      ),
    );
    fireEvent.click(nav().getByRole('button', { name: /^notes/i }));

    await waitFor(() =>
      expect(nav().getByRole('button', { name: /^notes/i })).toHaveAttribute(
        'aria-current',
        'page',
      ),
    );
    expect(screen.getByPlaceholderText(/add a note/i)).toHaveValue('half typed draft');
  });

  it('hides the section you left instead of showing both', async () => {
    await renderOpenOnNotes();
    fireEvent.click(nav().getByRole('button', { name: /^contacts/i }));

    await waitFor(() =>
      expect(nav().getByRole('button', { name: /^contacts/i })).toHaveAttribute(
        'aria-current',
        'page',
      ),
    );
    // Still in the DOM (that is the point), but not on screen.
    expect(screen.getByPlaceholderText(/add a note/i)).not.toBeVisible();
  });

  it('does not mount a section, or ask for its data, before it is first opened', async () => {
    await renderOpenOnNotes();
    expect(countCalls('query Contacts')).toBe(0);

    fireEvent.click(nav().getByRole('button', { name: /^contacts/i }));
    await waitFor(() => expect(countCalls('query Contacts')).toBe(1));
  });

  it('stops a hidden section refetching when its queries are refetched', async () => {
    await renderOpenOnNotes();
    // `invalidateQueries` refetches only queries that still have a mounted
    // observer, which is what a focus or interval refetch would do too.
    const refetches = async () => {
      const before = countCalls('query Notes');
      await act(async () => {
        await client.invalidateQueries();
      });
      return countCalls('query Notes') - before;
    };

    // Control: while Notes is on screen it is refetched.
    expect(await refetches()).toBeGreaterThan(0);

    fireEvent.click(nav().getByRole('button', { name: /^contacts/i }));
    await waitFor(() =>
      expect(nav().getByRole('button', { name: /^contacts/i })).toHaveAttribute(
        'aria-current',
        'page',
      ),
    );

    // Hidden: its effects are torn down, so its query has no observer to refetch.
    expect(await refetches()).toBe(0);
  });

  it('keeps the current section live, and marks the nav busy, until the switch settles', async () => {
    await renderOpenOnNotes();
    let finish: () => void = () => {};
    mockNavigate.mockImplementationOnce((opts?: { search?: { section?: string } }) => {
      return new Promise<void>((resolve) => {
        finish = () => {
          if (opts?.search) searchStore.set(opts.search);
          resolve();
        };
      });
    });

    fireEvent.click(nav().getByRole('button', { name: /^contacts/i }));

    await waitFor(() =>
      expect(screen.getByLabelText('Section navigation')).toHaveAttribute('aria-busy', 'true'),
    );
    // The old section is still on screen and still takes input.
    const textarea = screen.getByPlaceholderText(/add a note/i);
    expect(textarea).toBeVisible();
    fireEvent.change(textarea, { target: { value: 'typed while switching' } });
    expect(textarea).toHaveValue('typed while switching');
    expect(nav().getByRole('button', { name: /^notes/i })).toHaveAttribute('aria-current', 'page');

    await act(async () => finish());

    await waitFor(() =>
      expect(screen.getByLabelText('Section navigation')).toHaveAttribute('aria-busy', 'false'),
    );
    expect(nav().getByRole('button', { name: /^contacts/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
