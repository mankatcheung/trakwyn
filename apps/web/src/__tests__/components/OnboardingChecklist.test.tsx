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

import { OnboardingChecklist } from '#/routes/_authenticated/-components/OnboardingChecklist';
import type { OnboardingChecklistData } from '#/routes/_authenticated/dashboard';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

const baseData: OnboardingChecklistData = {
  me: { onboardingChecklistDismissedAt: null },
  apiTokens: [],
  llmApiKeys: [],
  workExperiences: [],
};

describe('OnboardingChecklist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGqlRequest.mockResolvedValue({ dismissOnboardingChecklist: true });
  });

  it('shows all items unchecked when nothing is complete', () => {
    render(<OnboardingChecklist data={baseData} hasApplications={false} />, { wrapper: Wrapper });

    expect(screen.getByText('Get started with Trakwyn')).toBeInTheDocument();
    expect(screen.getByText('Create your first job application')).toBeInTheDocument();
    expect(screen.getByText('Connect MCP by generating an API token')).toBeInTheDocument();
    expect(screen.getByText('Add an AI provider API key')).toBeInTheDocument();
    expect(screen.getByText('Add your work experience and skills')).toBeInTheDocument();
  });

  it('renders nothing when dismissed', () => {
    render(
      <OnboardingChecklist
        data={{ ...baseData, me: { onboardingChecklistDismissedAt: '2026-01-01T00:00:00.000Z' } }}
        hasApplications={false}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.queryByText('Get started with Trakwyn')).not.toBeInTheDocument();
  });

  it('renders nothing when all four items are complete', () => {
    render(
      <OnboardingChecklist
        data={{
          ...baseData,
          apiTokens: [{ id: 'token-1' }],
          llmApiKeys: [{ provider: 'openai' }],
          workExperiences: [{ id: 'exp-1' }],
        }}
        hasApplications
      />,
      { wrapper: Wrapper },
    );

    expect(screen.queryByText('Get started with Trakwyn')).not.toBeInTheDocument();
  });

  it('links each item to its underlying settings/creation page', () => {
    render(<OnboardingChecklist data={baseData} hasApplications={false} />, { wrapper: Wrapper });

    expect(screen.getByText('Create your first job application').closest('a')).toHaveAttribute(
      'href',
      '/applications/new',
    );
    expect(screen.getByText('Connect MCP by generating an API token').closest('a')).toHaveAttribute(
      'href',
      '/settings/integrations',
    );
    expect(screen.getByText('Add an AI provider API key').closest('a')).toHaveAttribute(
      'href',
      '/settings/ai',
    );
    expect(screen.getByText('Add your work experience and skills').closest('a')).toHaveAttribute(
      'href',
      '/settings/experience',
    );
  });

  it('dismisses the checklist via the server mutation', async () => {
    render(<OnboardingChecklist data={baseData} hasApplications={false} />, { wrapper: Wrapper });

    screen.getByLabelText('Dismiss checklist').click();

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('dismissOnboardingChecklist'),
      );
    });
  });
});
