import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MockQuestionGenerator } from '#/features/interviews/components/mock/MockQuestionGenerator';

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

const generated = (overrides: Record<string, unknown> = {}) => ({
  suggestions: ['Tell me about a bug?', 'Why this company?', 'Describe a launch?'],
  usedProfile: true,
  usedDocument: false,
  usedJobDescription: true,
  usedBriefing: true,
  ...overrides,
});

let generateResult: () => Promise<unknown>;
let createResult: (question: string) => Promise<unknown>;

function setup(props: Partial<Parameters<typeof MockQuestionGenerator>[0]> = {}) {
  const handlers = { onSaved: vi.fn(), onClose: vi.fn() };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MockQuestionGenerator
        applicationId="app-1"
        roundId="round-1"
        slotsLeft={10}
        {...handlers}
        {...props}
      />
    </QueryClientProvider>,
  );
  return handlers;
}

const generate = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
  await screen.findByText(/^Suggestions/);
};

beforeEach(() => {
  vi.clearAllMocks();
  try {
    window.localStorage.removeItem('trakwyn.mockUseProfile');
  } catch {
    // Storage may be unavailable here; the picker then falls back to its default.
  }
  generateResult = () => Promise.resolve({ generateMockInterviewQuestions: generated() });
  createResult = () => Promise.resolve({});
  mockGqlRequest.mockImplementation((_doc: unknown, vars: Record<string, unknown>) => {
    if ('count' in vars) return generateResult();
    if ('input' in vars) {
      return createResult((vars.input as { question: string }).question);
    }
    return Promise.resolve({ documents: [] });
  });
});

describe('MockQuestionGenerator', () => {
  it('starts with no suggestions and the profile left out', () => {
    setup();

    expect(
      screen.getByRole('heading', { name: 'Generate practice questions' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Use my profile/ })).not.toBeChecked();
    expect(screen.queryByText(/^Suggestions/)).not.toBeInTheDocument();
  });

  it('closes from Cancel', () => {
    const { onClose } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('sends the focus and background it was given and selects every suggestion', async () => {
    setup();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  system design  ' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Use my profile/ }));

    await generate();

    expect(mockGqlRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        interviewRoundId: 'round-1',
        prompt: 'system design',
        useProfile: true,
        documentId: null,
      }),
    );
    expect(screen.getByText('Suggestions · 3')).toBeInTheDocument();
    expect(screen.getByText('3 selected', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeInTheDocument();
  });

  it('shows the error when generating fails', async () => {
    generateResult = () => Promise.reject(gqlError('No AI set up'));
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No AI set up');
    expect(screen.queryByText(/^Suggestions/)).not.toBeInTheDocument();
  });

  it('adds only the suggestions still ticked, one after another, then closes', async () => {
    const { onSaved, onClose } = setup();
    await generate();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Why this company?' }));
    expect(screen.getByRole('button', { name: 'Add 2 to Practice' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 to Practice' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSaved).toHaveBeenCalledOnce();
    const created = mockGqlRequest.mock.calls
      .filter(([, vars]) => 'input' in vars)
      .map(([, vars]) => vars.input);
    expect(created).toEqual([
      { interviewRoundId: 'round-1', question: 'Tell me about a bug?' },
      { interviewRoundId: 'round-1', question: 'Describe a launch?' },
    ]);
  });

  it('can bring a dropped suggestion back, and add nothing when none is ticked', async () => {
    setup();
    await generate();
    const boxes = screen.getAllByRole('checkbox').slice(1);

    boxes.forEach((box) => fireEvent.click(box));
    expect(screen.getByRole('button', { name: 'Add 0 to Practice' })).toBeDisabled();

    fireEvent.click(boxes[0]);
    expect(screen.getByRole('button', { name: 'Add 1 to Practice' })).toBeEnabled();
  });

  it('blocks adding more than the round has room for', async () => {
    setup({ slotsLeft: 2 });
    await generate();

    expect(screen.getByRole('alert')).toHaveTextContent(/maximum of/);
    expect(screen.getByRole('button', { name: 'Add 3 to Practice' })).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Describe a launch?' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add 2 to Practice' })).toBeEnabled();
  });

  it('shows the error from saving, still tells the parent, and stays open', async () => {
    createResult = () => Promise.reject(gqlError('Limit reached'));
    const { onSaved, onClose } = setup();
    await generate();

    fireEvent.click(screen.getByRole('button', { name: 'Add 3 to Practice' }));

    expect(await screen.findByText('Limit reached')).toBeInTheDocument();
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('discards the suggestions', async () => {
    const { onClose } = setup();
    await generate();

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  describe('the note under the suggestions', () => {
    const note = async (result: Record<string, unknown>, background = false) => {
      generateResult = () => Promise.resolve({ generateMockInterviewQuestions: generated(result) });
      setup();
      if (background) fireEvent.click(screen.getByRole('checkbox', { name: /Use my profile/ }));
      await generate();
    };

    it('says nothing when everything asked for was used', async () => {
      await note({}, true);

      expect(screen.queryByText(/There is no|had nothing to work from/)).not.toBeInTheDocument();
    });

    it('says the background had nothing to work from when it was asked for and unused', async () => {
      await note({ usedProfile: false, usedDocument: false }, true);

      expect(screen.getByText(/had nothing to work from/)).toBeInTheDocument();
    });

    it('says there is no description or briefing to work from', async () => {
      await note({ usedJobDescription: false, usedBriefing: false });

      expect(screen.getByText(/no job description or company briefing/)).toBeInTheDocument();
    });

    it('says there is no briefing yet', async () => {
      await note({ usedBriefing: false });

      expect(screen.getByText(/no company briefing yet/)).toBeInTheDocument();
    });

    it('says there is no job description yet', async () => {
      await note({ usedJobDescription: false });

      expect(screen.getByText(/no job description yet/)).toBeInTheDocument();
    });
  });
});
