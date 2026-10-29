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

import {
  OnboardingChecklist,
  isRelevantToGoals,
} from '#/routes/_authenticated/-components/OnboardingChecklist';
import type { OnboardingChecklistData } from '#/routes/_authenticated/dashboard';
import type { OnboardingGoal } from '#/lib/onboarding';

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
      '/profile',
    );
  });

  describe('built from the welcome-flow goals (JEF-460)', () => {
    const withGoals = (goals: OnboardingGoal[]): OnboardingChecklistData => ({
      ...baseData,
      me: { onboardingChecklistDismissedAt: null, onboardingGoals: goals },
    });

    it('keeps every item when no goals are stored', () => {
      render(<OnboardingChecklist data={withGoals([])} hasApplications={false} />, {
        wrapper: Wrapper,
      });

      expect(screen.getAllByRole('link')).toHaveLength(4);
    });

    it('shows only the application item for someone who only tracks applications', () => {
      render(
        <OnboardingChecklist data={withGoals(['TRACK_APPLICATIONS'])} hasApplications={false} />,
        {
          wrapper: Wrapper,
        },
      );

      expect(screen.getByText('Create your first job application')).toBeInTheDocument();
      expect(screen.queryByText('Connect MCP by generating an API token')).not.toBeInTheDocument();
      expect(screen.queryByText('Add an AI provider API key')).not.toBeInTheDocument();
      expect(screen.queryByText('Add your work experience and skills')).not.toBeInTheDocument();
    });

    it('adds the AI key and experience items for an AI goal, and MCP only for the MCP goal', () => {
      render(<OnboardingChecklist data={withGoals(['ASSISTANT'])} hasApplications={false} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByText('Add an AI provider API key')).toBeInTheDocument();
      expect(screen.getByText('Add your work experience and skills')).toBeInTheDocument();
      expect(screen.queryByText('Connect MCP by generating an API token')).not.toBeInTheDocument();
    });

    it('shows the MCP item, without the AI items, for the MCP goal alone', () => {
      render(<OnboardingChecklist data={withGoals(['MCP'])} hasApplications={false} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByText('Connect MCP by generating an API token')).toBeInTheDocument();
      expect(screen.queryByText('Add an AI provider API key')).not.toBeInTheDocument();
      expect(screen.queryByText('Add your work experience and skills')).not.toBeInTheDocument();
    });

    it('hides once the items relevant to the goals are done, whatever the others say', () => {
      render(<OnboardingChecklist data={withGoals(['TRACK_APPLICATIONS'])} hasApplications />, {
        wrapper: Wrapper,
      });

      expect(screen.queryByText('Get started with Trakwyn')).not.toBeInTheDocument();
    });

    it.each([
      ['application', [], true],
      ['application', ['MCP'], true],
      ['mcp', ['AI_DOCUMENTS'], false],
      ['mcp', ['MCP', 'ASSISTANT'], true],
      ['aiKey', ['AI_DOCUMENTS'], true],
      ['aiKey', ['TRACK_APPLICATIONS', 'MCP'], false],
      ['experience', ['ASSISTANT'], true],
      ['experience', ['MCP'], false],
    ] as const)('isRelevantToGoals(%s, %j) is %s', (key, goals, expected) => {
      expect(isRelevantToGoals(key, goals)).toBe(expected);
    });
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
