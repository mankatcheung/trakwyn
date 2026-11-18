import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest, mockNavigate } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => mockNavigate,
}));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));

import { WelcomePage } from '#/features/onboarding/pages/WelcomePage';
import {
  COMPLETE_ONBOARDING,
  ONBOARDING_STATE_KEY,
} from '#/features/onboarding/graphql/onboardingQueries';
import { gqlText } from '#/__tests__/helpers/gqlText';
import { mockGql, respond, respondError } from '#/__tests__/helpers/gqlMock';
import { LLM_API_KEYS_QUERY } from '#/features/settings/graphql/aiQueries';
import { SKILLS_QUERY } from '#/features/profile/graphql/skillQueries';
import { WORK_EXPERIENCES_QUERY } from '#/features/profile/graphql/workExperienceQueries';

let client: QueryClient;

function renderPage() {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <WelcomePage />
    </QueryClientProvider>,
  );
}

let llmApiKeys: { provider: string }[] = [];

function mockApi() {
  mockGql(mockGqlRequest, [
    respond(COMPLETE_ONBOARDING, { completeOnboarding: true }),
    // Read at request time: a test sets `llmApiKeys` after `mockApi()` has run.
    respond(LLM_API_KEYS_QUERY, () => ({ llmApiKeys, me: { aiProviderOrder: [] } })),
    respond(WORK_EXPERIENCES_QUERY, { workExperiences: [] }),
    respond(SKILLS_QUERY, { skills: [] }),
  ]);
}

const click = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const pick = (label: RegExp) => fireEvent.click(screen.getByRole('checkbox', { name: label }));
const heading = () => screen.getByRole('heading', { level: 1 });

function completeCalls() {
  return mockGqlRequest.mock.calls.filter(([query]) =>
    gqlText(query).includes('completeOnboarding'),
  );
}

describe('WelcomePage (JEF-460)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    llmApiKeys = [];
    mockApi();
  });

  it('opens on the welcome step, with a way to skip the whole setup', () => {
    renderPage();

    expect(heading()).toHaveTextContent('Welcome to Trakwyn');
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /skip setup/i })).toBeInTheDocument();
  });

  it('skipping the setup saves no goals, marks it done and goes to the dashboard', async () => {
    renderPage();

    click(/skip setup/i);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/dashboard' }));
    expect(completeCalls()).toEqual([[expect.anything(), { goals: [] }]]);
    expect(client.getQueryData(ONBOARDING_STATE_KEY)).toMatchObject({
      onboardingCompletedAt: expect.any(String),
      onboardingGoals: [],
    });
  });

  it('asks what the user wants help with, offering all four goals', () => {
    renderPage();
    click(/get started/i);

    expect(heading()).toHaveTextContent('What do you want help with?');
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
  });

  it('goes straight to finish, and on to a new application, when tracking is the only goal', async () => {
    renderPage();
    click(/get started/i);
    pick(/track my applications/i);

    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    click(/continue/i);

    expect(heading()).toHaveTextContent("You're all set");
    click(/add your first application/i);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/applications/new' }));
    expect(completeCalls()).toEqual([[expect.anything(), { goals: ['TRACK_APPLICATIONS'] }]]);
  });

  it('asks for no profile or key for the MCP goal alone', () => {
    renderPage();
    click(/get started/i);
    pick(/use trakwyn from my ai tools/i);
    click(/continue/i);

    expect(heading()).toHaveTextContent("You're all set");
  });

  it('adds the profile and AI key steps for an AI goal, then lands on the dashboard', async () => {
    renderPage();
    click(/get started/i);
    pick(/write resumes and cover letters/i);
    pick(/track my applications/i);

    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument();
    click(/continue/i);

    expect(heading()).toHaveTextContent('Tell us about your experience');
    expect(await screen.findByRole('heading', { name: /work experience/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /skills/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open the full profile/i })).toHaveAttribute(
      'href',
      '/profile',
    );

    click(/skip this step/i);
    expect(heading()).toHaveTextContent('Connect your AI provider');
    expect(await screen.findByText('Provider')).toBeInTheDocument();

    click(/skip this step/i);
    click(/go to the dashboard/i);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/dashboard' }));
    // Kept in display order, not the order they were ticked in.
    expect(completeCalls()).toEqual([
      [expect.anything(), { goals: ['TRACK_APPLICATIONS', 'AI_DOCUMENTS'] }],
    ]);
  });

  it('says the AI key is done instead of showing the form when one is already saved', async () => {
    llmApiKeys = [{ provider: 'openai' }];
    renderPage();
    click(/get started/i);
    pick(/ask the assistant/i);
    click(/continue/i);
    click(/continue/i);

    expect(await screen.findByText('Your AI key is connected.')).toBeInTheDocument();
    expect(screen.queryByText('Provider')).not.toBeInTheDocument();
  });

  it('skipping the goals step drops any goals ticked and finishes with none', async () => {
    renderPage();
    click(/get started/i);
    pick(/ask the assistant/i);
    click(/skip this step/i);

    expect(heading()).toHaveTextContent("You're all set");
    click(/go to the dashboard/i);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(completeCalls()).toEqual([[expect.anything(), { goals: [] }]]);
  });

  it('goes back a step without losing the goals', () => {
    renderPage();
    click(/get started/i);
    pick(/ask the assistant/i);
    click(/continue/i);
    click(/^back$/i);

    expect(heading()).toHaveTextContent('What do you want help with?');
    expect(screen.getByRole('checkbox', { name: /ask the assistant/i })).toBeChecked();
  });

  it('stays put and says so when saving fails', async () => {
    mockGql(mockGqlRequest, [
      respondError(COMPLETE_ONBOARDING, new Error('boom')),
      respond(LLM_API_KEYS_QUERY, { llmApiKeys: [], me: { aiProviderOrder: [] } }),
      respond(WORK_EXPERIENCES_QUERY, { workExperiences: [] }),
      respond(SKILLS_QUERY, { skills: [] }),
    ]);
    renderPage();

    click(/skip setup/i);

    expect(await screen.findByText("We couldn't save that. Try again.")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
