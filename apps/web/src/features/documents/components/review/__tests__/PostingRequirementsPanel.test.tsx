import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

const credits = vi.hoisted(() => ({ onTrakwynAi: false }));

vi.mock('#/features/ai/hooks/useAiCredits', () => ({
  useAiCredits: () => ({
    onTrakwynAi: credits.onTrakwynAi,
    needsSetup: false,
    view: null,
    costOf: () => (credits.onTrakwynAi ? 1 : null),
    canAfford: () => true,
    refresh: () => Promise.resolve(),
  }),
}));

import { PostingRequirementsPanel } from '#/features/documents/components/review/PostingRequirementsPanel';
import type { PostingRequirements } from '#/features/documents/graphql/postingRequirementsQueries';

const saved: PostingRequirements = {
  id: 'req-1',
  applicationId: 'app-1',
  mustHave: ['5+ years of backend development', 'PostgreSQL in production'],
  niceToHave: ['Experience with Kafka'],
  keywords: ['PostgreSQL', 'Kubernetes'],
  seniority: 'Senior',
  generatedAt: '2026-11-15T12:00:00.000Z',
  isStale: false,
};

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PostingRequirementsPanel applicationId="app-1" />
    </QueryClientProvider>,
  );
}

const gqlError = (code: string, message: string) =>
  Object.assign(new Error(message), {
    response: { errors: [{ message, extensions: { code } }] },
  });

describe('PostingRequirementsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    credits.onTrakwynAi = false;
  });

  it('shows nothing until the saved list is known', () => {
    mockGqlRequest.mockReturnValue(new Promise(() => {}));

    const { container } = renderPanel();

    expect(container).toBeEmptyDOMElement();
  });

  it('offers to read a posting that has not been read', async () => {
    mockGqlRequest.mockResolvedValue({ postingRequirements: null });

    renderPanel();

    expect(await screen.findByRole('button', { name: 'Read requirements' })).toBeEnabled();
    expect(screen.getByText(/tailored against them/)).toBeInTheDocument();
    expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('PostingRequirements'), {
      applicationId: 'app-1',
    });
  });

  it('lists the saved requirements and offers no re-read while they are current', async () => {
    mockGqlRequest.mockResolvedValue({ postingRequirements: saved });

    renderPanel();

    expect(await screen.findByText('5+ years of backend development')).toBeInTheDocument();
    expect(screen.getByText('Experience with Kafka')).toBeInTheDocument();
    expect(screen.getByText('Kubernetes')).toBeInTheDocument();
    expect(screen.getByText('Senior')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /What this role asks for/ })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says when the posting has changed and lets the user read it again', async () => {
    mockGqlRequest.mockResolvedValue({ postingRequirements: { ...saved, isStale: true } });

    renderPanel();

    expect(await screen.findByText(/posting has changed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Read again' })).toBeEnabled();
  });

  it('reads the posting on demand and shows the result', async () => {
    mockGqlRequest
      .mockResolvedValueOnce({ postingRequirements: null })
      .mockResolvedValueOnce({ extractPostingRequirements: saved });

    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Read requirements' }));

    expect(await screen.findByText('PostgreSQL in production')).toBeInTheDocument();
    expect(mockGqlRequest).toHaveBeenLastCalledWith(
      expect.stringContaining('ExtractPostingRequirements'),
      { applicationId: 'app-1' },
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says so when a posting states no requirements', async () => {
    mockGqlRequest.mockResolvedValue({
      postingRequirements: { ...saved, mustHave: [], niceToHave: [], keywords: [] },
    });

    renderPanel();

    expect(await screen.findByText(/states no specific requirements/)).toBeInTheDocument();
  });

  it('shows the API’s message when reading fails, and keeps the button', async () => {
    mockGqlRequest
      .mockResolvedValueOnce({ postingRequirements: null })
      .mockRejectedValueOnce(gqlError('RATE_LIMITED', 'Too many requests — please wait'));

    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Read requirements' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Read requirements' })).toBeEnabled(),
    );
  });

  it('shows what the read costs to a user on Trakwyn AI', async () => {
    credits.onTrakwynAi = true;
    mockGqlRequest.mockResolvedValue({ postingRequirements: null });

    renderPanel();

    await screen.findByRole('button', { name: 'Read requirements' });
    expect(screen.getByText(/1 credit/i)).toBeInTheDocument();
  });
});
