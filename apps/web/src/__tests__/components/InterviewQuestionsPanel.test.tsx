import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
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

import { showUndoToast } from '#/lib/undoToast';
import { InterviewQuestionsPanel } from '#/routes/_authenticated/applications/$applicationId/-components/InterviewQuestionsPanel';

function Wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // The panel updates the round list's count on delete, so give it one to update.
  client.setQueryData(['interviewRounds', 'app-1'], {
    interviewRounds: [{ id: 'round-1', questionCount: 3 }],
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const makeQuestion = (overrides: Record<string, unknown> = {}) => ({
  id: 'q1',
  interviewRoundId: 'round-1',
  question: 'Describe a hard bug.',
  answer: 'A race in the cache layer.',
  position: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const THREE_QUESTIONS = [
  makeQuestion({ id: 'q1', question: 'First question', position: 0 }),
  makeQuestion({ id: 'q2', question: 'Second question', answer: null, position: 1 }),
  makeQuestion({ id: 'q3', question: 'Third question', answer: 'Third answer', position: 2 }),
];

function mockApi(questions = THREE_QUESTIONS, extra?: (query: string) => unknown) {
  mockGqlRequest.mockImplementation((query: string) => {
    const handled = extra?.(query);
    if (handled !== undefined) return handled;
    if (query.includes('query InterviewQuestions')) {
      return Promise.resolve({ interviewQuestions: questions });
    }
    if (query.includes('CreateInterviewQuestion')) {
      return Promise.resolve({ createInterviewQuestion: makeQuestion({ id: 'q-new' }) });
    }
    if (query.includes('UpdateInterviewQuestion')) {
      return Promise.resolve({ updateInterviewQuestion: makeQuestion() });
    }
    if (query.includes('ReorderInterviewQuestions')) {
      return Promise.resolve({ reorderInterviewQuestions: questions });
    }
    if (query.includes('DeleteInterviewQuestion')) {
      return Promise.resolve({ deleteInterviewQuestion: true });
    }
    return Promise.resolve({});
  });
}

const props = { applicationId: 'app-1', roundId: 'round-1', questionCount: 3 };

async function openPanel(overrides: Partial<typeof props> = {}) {
  render(<InterviewQuestionsPanel {...props} {...overrides} />, { wrapper: Wrapper });
  fireEvent.click(screen.getByRole('button', { name: /question/i }));
  await screen.findByText('First question');
}

describe('InterviewQuestionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
  });

  describe('the count', () => {
    it.each([
      [0, 'No questions yet'],
      [1, '1 question'],
      [3, '3 questions'],
    ])('labels %i questions as "%s"', (questionCount, label) => {
      render(<InterviewQuestionsPanel {...props} questionCount={questionCount} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    });

    it('does not fetch the questions until the panel is opened', () => {
      render(<InterviewQuestionsPanel {...props} />, { wrapper: Wrapper });

      expect(mockGqlRequest).not.toHaveBeenCalled();
    });

    it('reports its expanded state to assistive technology', async () => {
      render(<InterviewQuestionsPanel {...props} />, { wrapper: Wrapper });
      const toggle = screen.getByRole('button', { name: '3 questions' });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(toggle);

      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await screen.findByText('First question');
    });
  });

  describe('listing', () => {
    it('shows each question with its response, and marks an unanswered one', async () => {
      await openPanel();

      expect(screen.getByText('A race in the cache layer.')).toBeInTheDocument();
      expect(screen.getByText('Third answer')).toBeInTheDocument();
      expect(screen.getByText(/No response recorded yet/)).toBeInTheDocument();
      expect(screen.getByText('3 of 50')).toBeInTheDocument();
      expect(mockGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('query InterviewQuestions'),
        { interviewRoundId: 'round-1' },
      );
    });

    it('shows the error when the questions cannot be loaded', async () => {
      mockApi(THREE_QUESTIONS, (query) =>
        query.includes('query InterviewQuestions')
          ? Promise.reject({ response: { errors: [{ message: 'Forbidden' }] } })
          : undefined,
      );
      render(<InterviewQuestionsPanel {...props} />, { wrapper: Wrapper });

      fireEvent.click(screen.getByRole('button', { name: '3 questions' }));

      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });
  });

  describe('adding', () => {
    it('saves a question without a response', async () => {
      await openPanel();

      fireEvent.click(screen.getByRole('button', { name: /add question/i }));
      fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Why us?' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(
          expect.stringContaining('CreateInterviewQuestion'),
          { input: { interviewRoundId: 'round-1', question: 'Why us?' } },
        );
      });
    });

    it('saves a question together with its response', async () => {
      await openPanel();

      fireEvent.click(screen.getByRole('button', { name: /add question/i }));
      fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Why us?' } });
      fireEvent.change(screen.getByLabelText(/Your response/), {
        target: { value: 'The product.' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(
          expect.stringContaining('CreateInterviewQuestion'),
          { input: { interviewRoundId: 'round-1', question: 'Why us?', answer: 'The product.' } },
        );
      });
    });

    it('will not save until there is a question', async () => {
      await openPanel();

      fireEvent.click(screen.getByRole('button', { name: /add question/i }));
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Question'), { target: { value: '   ' } });
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('closes the form on cancel without sending anything', async () => {
      await openPanel();
      mockGqlRequest.mockClear();

      fireEvent.click(screen.getByRole('button', { name: /add question/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByLabelText('Question')).not.toBeInTheDocument();
      expect(mockGqlRequest).not.toHaveBeenCalled();
    });

    it("shows the server's message when the round is full", async () => {
      mockApi(THREE_QUESTIONS, (query) =>
        query.includes('CreateInterviewQuestion')
          ? Promise.reject({
              response: {
                errors: [
                  {
                    message: 'This interview round already has the maximum of 50 questions',
                    extensions: { code: 'QUOTA_EXCEEDED' },
                  },
                ],
              },
            })
          : undefined,
      );
      await openPanel();

      fireEvent.click(screen.getByRole('button', { name: /add question/i }));
      fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'One more' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/maximum of 50 questions/);
    });

    it('stops offering to add once the round holds the maximum', async () => {
      await openPanel({ questionCount: 50 });

      expect(screen.queryByRole('button', { name: /add question/i })).not.toBeInTheDocument();
      expect(screen.getByText(/maximum of 50 questions/)).toBeInTheDocument();
    });
  });

  describe('editing', () => {
    it('changes the question and the response', async () => {
      await openPanel();

      fireEvent.click(screen.getAllByRole('button', { name: 'Edit question' })[0]);
      fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Reworded' } });
      fireEvent.change(screen.getByLabelText(/Your response/), { target: { value: 'New answer' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(
          expect.stringContaining('UpdateInterviewQuestion'),
          { id: 'q1', input: { question: 'Reworded', answer: 'New answer' } },
        );
      });
    });

    it('clears the response when it is emptied', async () => {
      await openPanel();

      fireEvent.click(screen.getAllByRole('button', { name: 'Edit question' })[0]);
      fireEvent.change(screen.getByLabelText(/Your response/), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(
          expect.stringContaining('UpdateInterviewQuestion'),
          { id: 'q1', input: { question: 'First question', answer: null } },
        );
      });
    });

    it("does not show one question's failed save on another question's form", async () => {
      mockApi(THREE_QUESTIONS, (query) =>
        query.includes('UpdateInterviewQuestion')
          ? Promise.reject({
              response: {
                errors: [
                  { message: 'Could not save that one', extensions: { code: 'VALIDATION' } },
                ],
              },
            })
          : undefined,
      );
      await openPanel();

      fireEvent.click(screen.getAllByRole('button', { name: 'Edit question' })[0]);
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Could not save that one');
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      fireEvent.click(screen.getAllByRole('button', { name: 'Edit question' })[1]);

      expect(screen.getByLabelText('Question')).toHaveValue('Second question');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('opens the editor from "Add response" on an unanswered question', async () => {
      await openPanel();

      fireEvent.click(screen.getByRole('button', { name: 'Add response' }));

      expect(screen.getByLabelText('Question')).toHaveValue('Second question');
      expect(screen.getByLabelText(/Your response/)).toHaveValue('');
    });
  });

  describe('deleting', () => {
    it('removes the question and sends the delete through the undo toast', async () => {
      // Once the delete has gone through, the server no longer lists the question.
      let deleted = false;
      mockApi(THREE_QUESTIONS, (query) => {
        if (query.includes('DeleteInterviewQuestion')) {
          deleted = true;
          return Promise.resolve({ deleteInterviewQuestion: true });
        }
        if (query.includes('query InterviewQuestions') && deleted) {
          return Promise.resolve({
            interviewQuestions: THREE_QUESTIONS.filter((q) => q.id !== 'q2'),
          });
        }
        return undefined;
      });
      await openPanel();

      fireEvent.click(screen.getAllByRole('button', { name: 'Delete question' })[1]);

      await waitFor(() => {
        expect(screen.queryByText('Second question')).not.toBeInTheDocument();
      });
      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(
          expect.stringContaining('DeleteInterviewQuestion'),
          { id: 'q2' },
        );
      });
    });
  });

  describe('while a delete waits out its undo window', () => {
    // The real toast sends the delete only once its window closes; these tests
    // hold it open and settle it by hand.
    let toast: { onUndo: () => void; onSettled?: () => void };
    beforeEach(() => {
      vi.mocked(showUndoToast).mockImplementationOnce((options) => {
        toast = options;
      });
    });

    it('keeps the question hidden and the count down, even if the list is refetched', async () => {
      await openPanel();

      fireEvent.click(screen.getAllByRole('button', { name: 'Delete question' })[1]);
      await waitFor(() => expect(screen.queryByText('Second question')).not.toBeInTheDocument());
      expect(screen.getByRole('button', { name: '2 questions' })).toBeInTheDocument();

      // Adding a question refetches the list, and the server (not yet told of
      // the delete) still returns the deleted one. It must not come back.
      fireEvent.click(screen.getByRole('button', { name: /add question/i }));
      fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Another' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(
          expect.stringContaining('CreateInterviewQuestion'),
          expect.anything(),
        );
      });
      await waitFor(() => expect(screen.queryByLabelText('Question')).not.toBeInTheDocument());

      expect(screen.queryByText('Second question')).not.toBeInTheDocument();
    });

    it('brings the question back, and the count, when the delete is undone', async () => {
      await openPanel();

      fireEvent.click(screen.getAllByRole('button', { name: 'Delete question' })[1]);
      await waitFor(() => expect(screen.queryByText('Second question')).not.toBeInTheDocument());
      act(() => toast.onUndo());

      expect(await screen.findByText('Second question')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '3 questions' })).toBeInTheDocument();
    });

    it('holds reordering until the delete settles, since the server still lists the question', async () => {
      await openPanel();

      fireEvent.click(screen.getAllByRole('button', { name: 'Delete question' })[1]);
      await waitFor(() => expect(screen.queryByText('Second question')).not.toBeInTheDocument());

      for (const button of screen.getAllByRole('button', { name: /Move question (up|down)/ })) {
        expect(button).toBeDisabled();
      }
    });
  });

  describe('reordering', () => {
    it('moves a question down', async () => {
      await openPanel();

      fireEvent.click(screen.getAllByRole('button', { name: 'Move question down' })[0]);

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(
          expect.stringContaining('ReorderInterviewQuestions'),
          { interviewRoundId: 'round-1', orderedIds: ['q2', 'q1', 'q3'] },
        );
      });
    });

    it('moves a question up', async () => {
      await openPanel();

      fireEvent.click(screen.getAllByRole('button', { name: 'Move question up' })[2]);

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(
          expect.stringContaining('ReorderInterviewQuestions'),
          { interviewRoundId: 'round-1', orderedIds: ['q1', 'q3', 'q2'] },
        );
      });
    });

    it('cannot move the first question up or the last one down', async () => {
      await openPanel();

      expect(screen.getAllByRole('button', { name: 'Move question up' })[0]).toBeDisabled();
      expect(screen.getAllByRole('button', { name: 'Move question down' })[2]).toBeDisabled();
    });
  });
});
