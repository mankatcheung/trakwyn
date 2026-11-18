import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MockTalkingPoints } from '#/features/interviews/components/mock/MockTalkingPoints';
import type { MockQuestion } from '#/features/interviews/graphql/mockQuestionApi';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));
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

const gqlError = (message: string) => ({
  response: { errors: [{ message, extensions: { code: 'VALIDATION_ERROR' } }] },
});

const question = (overrides: Partial<MockQuestion> = {}): MockQuestion =>
  ({
    id: 'q1',
    interviewRoundId: 'round-1',
    question: 'Describe a hard bug.',
    answer: null,
    answerSource: 'user',
    talkingPoints: null,
    talkingPointsGeneratedAt: null,
    position: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as MockQuestion;

function setup(q: MockQuestion = question()) {
  const onSaved = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MockTalkingPoints applicationId="app-1" question={q} onSaved={onSaved} />
    </QueryClientProvider>,
  );
  return { onSaved };
}

const serve = (generate: () => Promise<unknown>) =>
  mockGqlRequest.mockImplementation((_doc: unknown, vars: Record<string, unknown>) =>
    'mockInterviewQuestionId' in vars ? generate() : Promise.resolve({ documents: [] }),
  );

const open = () =>
  fireEvent.click(
    screen.getByRole('button', { name: /Talking points$|Regenerate talking points/ }),
  );
const generateButton = () => screen.getByRole('button', { name: 'Generate talking points' });

beforeEach(() => {
  vi.clearAllMocks();
  try {
    window.localStorage.removeItem('trakwyn.mockUseProfile');
  } catch {
    // Storage may be unavailable here; the picker then falls back to its default.
  }
  serve(() => Promise.resolve({ generateMockTalkingPoints: { nothingRelevant: false } }));
});

describe('MockTalkingPoints', () => {
  it('offers to make talking points for a question that has none', () => {
    setup();

    expect(screen.getByRole('button', { name: 'Talking points' })).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('lists the saved bullets without their dashes, with when they were made', () => {
    setup(
      question({
        talkingPoints: '- Led the fix\n\n-   Wrote the postmortem\nPlain line',
        talkingPointsGeneratedAt: '2026-03-04T12:00:00.000Z',
      }),
    );

    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Led the fix',
      'Wrote the postmortem',
      'Plain line',
    ]);
    expect(screen.getByText('AI generated')).toBeInTheDocument();
    expect(screen.getByText(/^Generated /)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate talking points' })).toBeInTheDocument();
  });

  it('shows the bullets without a date when none was recorded', () => {
    setup(question({ talkingPoints: '- One' }));

    expect(screen.queryByText(/^Generated /)).not.toBeInTheDocument();
  });

  it('opens the generator with the profile ticked, and closes it again', () => {
    setup();

    open();
    expect(screen.getByRole('checkbox', { name: /Use my profile/ })).toBeChecked();
    expect(generateButton()).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('cannot generate without a source', () => {
    setup();
    open();

    fireEvent.click(screen.getByRole('checkbox', { name: /Use my profile/ }));

    expect(generateButton()).toBeDisabled();
  });

  it('saves, closes and tells the parent once points are made', async () => {
    const { onSaved } = setup();
    open();

    fireEvent.click(generateButton());

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(mockGqlRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        mockInterviewQuestionId: 'q1',
        prompt: null,
        useProfile: true,
        documentId: null,
      }),
    );
  });

  it('sends the instructions when they are added', async () => {
    const { onSaved } = setup();
    open();

    fireEvent.click(screen.getByRole('button', { name: 'Add instructions' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: ' Focus on scale ' } });
    fireEvent.click(generateButton());

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mockGqlRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ prompt: 'Focus on scale' }),
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('hides the instructions again', () => {
    setup();
    open();

    fireEvent.click(screen.getByRole('button', { name: 'Add instructions' }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide instructions' }));

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('stays open and explains when nothing in the background was relevant', async () => {
    serve(() => Promise.resolve({ generateMockTalkingPoints: { nothingRelevant: true } }));
    const { onSaved } = setup();
    open();

    fireEvent.click(generateButton());

    expect(await screen.findByRole('status')).toHaveTextContent(/Nothing in your profile/);
    expect(onSaved).not.toHaveBeenCalled();
    expect(generateButton()).toBeInTheDocument();
  });

  it('shows the error when generating fails', async () => {
    serve(() => Promise.reject(gqlError('Provider down')));
    const { onSaved } = setup();
    open();

    fireEvent.click(generateButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Provider down');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('clears an earlier error and note when it is opened again', async () => {
    serve(() => Promise.resolve({ generateMockTalkingPoints: { nothingRelevant: true } }));
    setup();
    open();
    fireEvent.click(generateButton());
    await screen.findByRole('status');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    open();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
