import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

vi.mock('#/lib/undoToast', () => ({
  // Sends the operation the call site handed over, as the real toast does once
  // its window closes, so these tests also check the document and variables.
  showUndoToast: vi.fn(
    ({
      operation,
      onSettled,
    }: {
      operation: { document: string; variables?: Record<string, unknown> };
      onSettled?: () => void;
    }) => {
      void Promise.resolve(mockGqlRequest(operation.document, operation.variables))
        .catch(() => {})
        .finally(() => onSettled?.());
    },
  ),
}));

import { MockQuestionsPanel } from '#/routes/_authenticated/applications/$applicationId/-components/MockQuestionsPanel';

function Wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const makeQuestion = (overrides: Record<string, unknown> = {}) => ({
  id: 'q1',
  interviewRoundId: 'round-1',
  question: 'Describe a hard bug.',
  answer: 'A race in the cache layer.',
  answerSource: 'user',
  position: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const QUESTIONS = [
  makeQuestion({ id: 'q1', question: 'First question', position: 0 }),
  makeQuestion({
    id: 'q2',
    question: 'Second question',
    answer: 'Drafted by AI',
    answerSource: 'ai',
    position: 1,
  }),
  makeQuestion({ id: 'q3', question: 'Third question', answer: null, position: 2 }),
];

const GENERATED = {
  suggestions: ['Suggested one?', 'Suggested two?', 'Suggested three?'],
  usedJobDescription: true,
  usedBriefing: true,
};

function mockApi(questions = QUESTIONS, extra?: (query: string) => unknown) {
  mockGqlRequest.mockImplementation((query: string) => {
    const handled = extra?.(query);
    if (handled !== undefined) return handled;
    if (query.includes('query MockInterviewQuestions')) {
      return Promise.resolve({ mockInterviewQuestions: questions });
    }
    if (query.includes('CreateMockInterviewQuestion')) {
      return Promise.resolve({ createMockInterviewQuestion: makeQuestion({ id: 'q-new' }) });
    }
    if (query.includes('UpdateMockInterviewQuestion')) {
      return Promise.resolve({ updateMockInterviewQuestion: makeQuestion() });
    }
    if (query.includes('ReorderMockInterviewQuestions')) {
      return Promise.resolve({ reorderMockInterviewQuestions: questions });
    }
    if (query.includes('DeleteMockInterviewQuestion')) {
      return Promise.resolve({ deleteMockInterviewQuestion: true });
    }
    if (query.includes('GenerateMockInterviewQuestions')) {
      return Promise.resolve({ generateMockInterviewQuestions: GENERATED });
    }
    if (query.includes('GenerateMockInterviewAnswer')) {
      return Promise.resolve({
        generateMockInterviewAnswer: {
          answer: 'A drafted answer.',
          usedJobDescription: true,
          usedBriefing: true,
        },
      });
    }
    return Promise.resolve({});
  });
}

const props = { applicationId: 'app-1', roundId: 'round-1', mockQuestionCount: 3 };

const callsTo = (fragment: string) =>
  mockGqlRequest.mock.calls.filter(([query]) => String(query).includes(fragment));

async function openPanel(overrides: Partial<typeof props> = {}) {
  render(<MockQuestionsPanel {...props} {...overrides} />, { wrapper: Wrapper });
  fireEvent.click(screen.getByRole('button', { name: /practice/i }));
  await screen.findByText('First question');
}

describe('MockQuestionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
  });

  describe('the count', () => {
    it.each([
      [0, 'Practice questions'],
      [1, '1 practice question'],
      [3, '3 practice questions'],
    ])('labels %i questions as "%s"', (mockQuestionCount, label) => {
      render(<MockQuestionsPanel {...props} mockQuestionCount={mockQuestionCount} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    });

    it('does not fetch until the panel is opened, then asks for this round’s questions', async () => {
      render(<MockQuestionsPanel {...props} />, { wrapper: Wrapper });
      expect(mockGqlRequest).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: '3 practice questions' }));
      await screen.findByText('First question');

      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('query MockInterviewQuestions'),
        { interviewRoundId: 'round-1' },
      );
    });
  });

  describe('the list', () => {
    it('says these are practice questions, apart from the ones actually asked', async () => {
      await openPanel();

      expect(screen.getByRole('heading', { name: 'Practice questions' })).toBeInTheDocument();
      expect(
        screen.getByText(/kept apart from the questions you were actually asked/i),
      ).toBeVisible();
    });

    it('labels an AI answer, and only an AI answer', async () => {
      await openPanel();

      expect(screen.getAllByText('AI generated')).toHaveLength(1);
      const aiCard = screen.getByText('Drafted by AI').closest('article')!;
      expect(aiCard).toHaveTextContent('AI generated');
      const userCard = screen.getByText('A race in the cache layer.').closest('article')!;
      expect(userCard).not.toHaveTextContent('AI generated');
    });

    it('offers to write or generate an answer where there is none', async () => {
      await openPanel();

      const card = screen.getByText('Third question').closest('article')!;
      expect(card).toHaveTextContent('No answer yet.');
      expect(card).toContainElement(screen.getByRole('button', { name: 'Write answer' }));
      expect(card).toContainElement(
        screen.getByRole('button', { name: 'Generate answer with AI' }),
      );
    });
  });

  describe('adding and editing by hand', () => {
    it('adds a practice question without any AI label', async () => {
      await openPanel();

      fireEvent.click(screen.getByRole('button', { name: /add practice question/i }));
      fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Why us?' } });
      fireEvent.change(screen.getByLabelText(/your answer/i), { target: { value: 'Because.' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(callsTo('CreateMockInterviewQuestion')).toHaveLength(1));
      const [, variables] = callsTo('CreateMockInterviewQuestion')[0];
      expect(variables).toEqual({
        input: { interviewRoundId: 'round-1', question: 'Why us?', answer: 'Because.' },
      });
    });

    it('sends no answer source when editing, so an AI answer keeps its label', async () => {
      await openPanel();

      const aiCard = screen.getByText('Drafted by AI').closest('article')!;
      fireEvent.click(aiCard.querySelector('button[aria-label="Edit question"]')!);
      fireEvent.change(screen.getByLabelText(/your answer/i), {
        target: { value: 'Reworded by me' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(callsTo('UpdateMockInterviewQuestion')).toHaveLength(1));
      const [, variables] = callsTo('UpdateMockInterviewQuestion')[0];
      expect(variables).toEqual({
        id: 'q2',
        input: { question: 'Second question', answer: 'Reworded by me' },
      });
      expect(JSON.stringify(variables)).not.toContain('answerSource');
    });

    it('deletes through the undo toast', async () => {
      await openPanel();

      const card = screen.getByText('First question').closest('article')!;
      fireEvent.click(card.querySelector('button[aria-label="Delete question"]')!);

      await waitFor(() =>
        expect(mockGqlRequest).toHaveBeenCalledWith(
          expect.stringContaining('DeleteMockInterviewQuestion'),
          { id: 'q1' },
        ),
      );
    });
  });

  describe('generating questions', () => {
    const openGenerator = async () => {
      await openPanel();
      fireEvent.click(screen.getByRole('button', { name: 'Generate questions' }));
    };

    it('sends the prompt and shows the suggestions, all selected, without saving any', async () => {
      await openGenerator();

      fireEvent.change(screen.getByLabelText(/what should the questions focus on/i), {
        target: { value: 'system design' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

      await screen.findByText('Suggested one?');
      expect(callsTo('GenerateMockInterviewQuestions')[0][1]).toEqual({
        interviewRoundId: 'round-1',
        prompt: 'system design',
        count: 5,
      });
      expect(screen.getAllByRole('checkbox')).toHaveLength(3);
      screen.getAllByRole('checkbox').forEach((box) => expect(box).toBeChecked());
      expect(screen.getByText(/3 selected/)).toBeInTheDocument();
      expect(callsTo('CreateMockInterviewQuestion')).toHaveLength(0);
    });

    it('sends no prompt when the field is left blank', async () => {
      await openGenerator();

      fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
      await screen.findByText('Suggested one?');

      expect(callsTo('GenerateMockInterviewQuestions')[0][1]).toMatchObject({ prompt: null });
    });

    it('saves only the suggestions the user keeps, one at a time', async () => {
      await openGenerator();
      fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
      await screen.findByText('Suggested one?');

      fireEvent.click(screen.getByRole('checkbox', { name: 'Suggested two?' }));
      expect(screen.getByText(/2 selected/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Add 2 to Practice' }));

      await waitFor(() => expect(callsTo('CreateMockInterviewQuestion')).toHaveLength(2));
      expect(callsTo('CreateMockInterviewQuestion').map(([, v]) => v)).toEqual([
        { input: { interviewRoundId: 'round-1', question: 'Suggested one?' } },
        { input: { interviewRoundId: 'round-1', question: 'Suggested three?' } },
      ]);
      await waitFor(() => expect(screen.queryByText('Suggested one?')).not.toBeInTheDocument());
    });

    it('does not add anything when there is nothing selected', async () => {
      await openGenerator();
      fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
      await screen.findByText('Suggested one?');

      screen.getAllByRole('checkbox').forEach((box) => fireEvent.click(box));

      expect(screen.getByRole('button', { name: 'Add 0 to Practice' })).toBeDisabled();
    });

    it('discarding closes the suggestions without saving', async () => {
      await openGenerator();
      fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
      await screen.findByText('Suggested one?');

      fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

      expect(screen.queryByText('Suggested one?')).not.toBeInTheDocument();
      expect(callsTo('CreateMockInterviewQuestion')).toHaveLength(0);
    });

    it.each([
      [
        { usedJobDescription: false, usedBriefing: false },
        /no job description or company briefing/i,
      ],
      [{ usedJobDescription: true, usedBriefing: false }, /no company briefing yet/i],
      [{ usedJobDescription: false, usedBriefing: true }, /no job description yet/i],
    ])('says so when the AI had little to work from (%j)', async (used, note) => {
      mockApi(QUESTIONS, (query) =>
        query.includes('GenerateMockInterviewQuestions')
          ? Promise.resolve({ generateMockInterviewQuestions: { ...GENERATED, ...used } })
          : undefined,
      );
      await openGenerator();

      fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

      expect(await screen.findByText(note)).toBeInTheDocument();
    });

    it('shows the API’s message, such as a missing AI key, and keeps the prompt', async () => {
      mockApi(QUESTIONS, (query) =>
        query.includes('GenerateMockInterviewQuestions')
          ? Promise.reject({
              response: {
                errors: [
                  {
                    message: 'Add your AI API key in Settings to use this feature',
                    extensions: { code: 'AI_NOT_CONFIGURED' },
                  },
                ],
              },
            })
          : undefined,
      );
      await openGenerator();
      fireEvent.change(screen.getByLabelText(/what should the questions focus on/i), {
        target: { value: 'behavioural' },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/Add your AI API key/);
      expect(screen.getByLabelText(/what should the questions focus on/i)).toHaveValue(
        'behavioural',
      );
    });

    it('stops offering to add or generate once the round is full', async () => {
      await openPanel({ mockQuestionCount: 30 });

      expect(screen.getByText(/maximum of 30 practice questions/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Generate questions' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /add practice question/i }),
      ).not.toBeInTheDocument();
    });

    it('will not add more suggestions than there are free slots', async () => {
      await openPanel({ mockQuestionCount: 28 });
      fireEvent.click(screen.getByRole('button', { name: 'Generate questions' }));
      fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
      await screen.findByText('Suggested one?');

      expect(screen.getByRole('alert')).toHaveTextContent(/maximum of 30 practice questions/i);
      expect(screen.getByRole('button', { name: 'Add 3 to Practice' })).toBeDisabled();

      fireEvent.click(screen.getByRole('checkbox', { name: 'Suggested three?' }));
      expect(screen.getByRole('button', { name: 'Add 2 to Practice' })).toBeEnabled();
    });
  });

  describe('generating an answer', () => {
    const startDraft = async () => {
      await openPanel();
      fireEvent.click(screen.getByRole('button', { name: 'Generate answer with AI' }));
      return screen.findByDisplayValue('A drafted answer.');
    };

    it('shows the draft for review, labelled as AI generated, and saves nothing yet', async () => {
      await startDraft();

      expect(screen.getByText('AI generated draft')).toBeInTheDocument();
      expect(callsTo('GenerateMockInterviewAnswer')[0][1]).toEqual({
        mockInterviewQuestionId: 'q3',
      });
      expect(callsTo('UpdateMockInterviewQuestion')).toHaveLength(0);
    });

    it('saves the draft, as the user left it, marked as AI generated', async () => {
      const textarea = await startDraft();

      fireEvent.change(textarea, { target: { value: 'A drafted answer, tightened.' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save answer' }));

      await waitFor(() => expect(callsTo('UpdateMockInterviewQuestion')).toHaveLength(1));
      expect(callsTo('UpdateMockInterviewQuestion')[0][1]).toEqual({
        id: 'q3',
        input: { answer: 'A drafted answer, tightened.', answerSource: 'ai' },
      });
    });

    it('discarding the draft saves nothing and offers the actions again', async () => {
      await startDraft();

      fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));

      expect(screen.queryByDisplayValue('A drafted answer.')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Generate answer with AI' })).toBeInTheDocument();
      expect(callsTo('UpdateMockInterviewQuestion')).toHaveLength(0);
    });

    it('regenerating replaces the draft text', async () => {
      await startDraft();
      mockApi(QUESTIONS, (query) =>
        query.includes('GenerateMockInterviewAnswer')
          ? Promise.resolve({
              generateMockInterviewAnswer: {
                answer: 'A second attempt.',
                usedJobDescription: true,
                usedBriefing: true,
              },
            })
          : undefined,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));

      expect(await screen.findByDisplayValue('A second attempt.')).toBeInTheDocument();
    });

    it('shows the API’s message when the draft cannot be generated', async () => {
      mockApi(QUESTIONS, (query) =>
        query.includes('GenerateMockInterviewAnswer')
          ? Promise.reject({
              response: {
                errors: [
                  {
                    message: 'Too many requests — please wait a moment and try again',
                    extensions: { code: 'RATE_LIMITED' },
                  },
                ],
              },
            })
          : undefined,
      );
      await openPanel();

      fireEvent.click(screen.getByRole('button', { name: 'Generate answer with AI' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/Too many requests/);
    });
  });
});
