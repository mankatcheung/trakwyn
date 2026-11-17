import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockNavigate, mockGqlRequest } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGqlRequest: vi.fn(),
}));

// The quota hint is covered by QuotaHint.test.tsx; here it would add a request of its own.
vi.mock('#/features/quota/lib/contentQuota', () => ({ useQuotaState: () => null }));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: unknown) => opts,
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { NewApplicationPage } from '#/routes/_authenticated/applications/-components/NewApplicationPage';

vi.mock('#/features/ai/hooks/useAiCredits', () => ({
  useAiCredits: () => ({
    onTrakwynAi: false,
    needsSetup: false,
    view: null,
    costOf: () => null,
    canAfford: () => true,
    refresh: () => Promise.resolve(),
  }),
}));

const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

let client: QueryClient;

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const renderPage = () => render(<NewApplicationPage />, { wrapper: Wrapper });

function fillRequired() {
  fireEvent.change(screen.getByPlaceholderText('Acme Corp'), { target: { value: 'Acme Corp' } });
  fireEvent.change(screen.getByPlaceholderText('Senior Engineer'), {
    target: { value: 'Engineer' },
  });
}

describe('NewApplicationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client = makeClient();
  });

  it('renders company and role inputs', () => {
    renderPage();
    expect(screen.getByPlaceholderText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Senior Engineer')).toBeInTheDocument();
  });

  it('shows validation error when company is empty', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText('Company is required')).toBeInTheDocument();
    });
    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('shows validation error when role is empty', async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Acme Corp'), {
      target: { value: 'Acme Corp' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText('Role is required')).toBeInTheDocument();
    });
    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('submits the form with company and role', async () => {
    mockGqlRequest.mockResolvedValue({ createApplication: { id: 'new-1' } });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Acme Corp'), {
      target: { value: 'Acme Corp' },
    });
    fireEvent.change(screen.getByPlaceholderText('Senior Engineer'), {
      target: { value: 'Engineer' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('CreateApplication'),
        expect.objectContaining({
          input: expect.objectContaining({ company: 'Acme Corp', role: 'Engineer' }),
        }),
      );
    });
  });

  it('navigates to application detail after successful creation', async () => {
    mockGqlRequest.mockResolvedValue({ createApplication: { id: 'new-1' } });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Acme Corp'), {
      target: { value: 'Acme Corp' },
    });
    fireEvent.change(screen.getByPlaceholderText('Senior Engineer'), {
      target: { value: 'Engineer' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({ to: '/applications/$applicationId' }),
      );
    });
  });

  it('offers the plan page when the application limit is reached (JEF-344)', async () => {
    mockGqlRequest.mockRejectedValue({
      response: {
        errors: [
          {
            message: 'You have reached the maximum of 50 applications',
            extensions: { code: 'QUOTA_EXCEEDED' },
          },
        ],
      },
    });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Acme Corp'), { target: { value: 'Acme Corp' } });
    fireEvent.change(screen.getByPlaceholderText('Senior Engineer'), {
      target: { value: 'Engineer' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText(/maximum of 50 applications/)).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'See what Pro includes' })).toHaveAttribute(
      'href',
      '/settings/plan',
    );
  });

  it('shows error on API failure', async () => {
    mockGqlRequest.mockRejectedValue(new Error('network error'));
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Acme Corp'), {
      target: { value: 'Acme Corp' },
    });
    fireEvent.change(screen.getByPlaceholderText('Senior Engineer'), {
      target: { value: 'Engineer' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('sends the full job posting when one is entered (JEF-591)', async () => {
    mockGqlRequest.mockResolvedValue({ createApplication: { id: 'new-1' } });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Acme Corp'), { target: { value: 'Acme Corp' } });
    fireEvent.change(screen.getByPlaceholderText('Senior Engineer'), {
      target: { value: 'Engineer' },
    });
    fireEvent.change(screen.getByLabelText('Full job posting'), {
      target: { value: '  Must have Kubernetes and PostgreSQL.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('CreateApplication'),
        expect.objectContaining({
          input: expect.objectContaining({ postingText: 'Must have Kubernetes and PostgreSQL.' }),
        }),
      );
    });
  });

  it('leaves the posting out of the request when the field is empty (JEF-591)', async () => {
    mockGqlRequest.mockResolvedValue({ createApplication: { id: 'new-1' } });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Acme Corp'), { target: { value: 'Acme Corp' } });
    fireEvent.change(screen.getByPlaceholderText('Senior Engineer'), {
      target: { value: 'Engineer' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
    const [, variables] = mockGqlRequest.mock.calls[0] as [string, { input: object }];
    expect(variables.input).not.toHaveProperty('postingText');
  });

  it('explains what the full posting is used for (JEF-591)', () => {
    renderPage();

    expect(screen.getByLabelText('Full job posting')).toHaveAccessibleDescription(
      /tailor your resume, cover letter and match score/i,
    );
  });

  it('invalidates the applications list after a create', async () => {
    mockGqlRequest.mockResolvedValue({ createApplication: { id: 'new-1' } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    renderPage();

    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['applications'] });
  });

  it('offers the plan page when a plan feature is required', async () => {
    mockGqlRequest.mockRejectedValue({
      response: {
        errors: [{ message: 'Tags need Pro', extensions: { code: 'PLAN_REQUIRED' } }],
      },
    });
    renderPage();

    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText('Tags need Pro')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See what Pro includes' })).toBeInTheDocument();
  });

  it('keeps what was typed when the API fails', async () => {
    mockGqlRequest.mockRejectedValue(new Error('network error'));
    renderPage();

    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await screen.findByText('Something went wrong. Please try again.');
    expect(screen.getByPlaceholderText('Acme Corp')).toHaveValue('Acme Corp');
    expect(screen.getByPlaceholderText('Senior Engineer')).toHaveValue('Engineer');
  });

  it('creates one application on a double click', async () => {
    let resolve!: (value: unknown) => void;
    mockGqlRequest.mockReturnValue(new Promise((r) => (resolve = r)));
    renderPage();

    fillRequired();
    const button = screen.getByRole('button', { name: /save/i });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    fireEvent.click(button);

    resolve({ createApplication: { id: 'new-1' } });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    expect(mockGqlRequest).toHaveBeenCalledTimes(1);
  });
});
