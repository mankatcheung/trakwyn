import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gqlContaining, gqlText } from '#/__tests__/helpers/gqlText';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

vi.mock('#/lib/undoToast', () => ({
  // Sends the operation the call site handed over, instead of running an
  // opaque callback. The request is now described as data so it can be
  // replayed after a refresh (JEF-191), which means this mock also checks
  // that each call site names the right document and variables.
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

import { InterviewsTab } from '#/features/interviews/components/InterviewsTab';

const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

const mockRound = {
  id: 'round-1',
  applicationId: 'app-1',
  type: 'technical',
  scheduledAt: '2024-06-01T15:00:00.000Z',
  completedAt: null,
  interviewerName: 'Alex Kim',
  notes: 'Discuss system design',
  outcome: 'pending',
  questionCount: 3,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const baseProps = { applicationId: 'app-1', company: 'Acme Corp', role: 'Engineer' };

describe('InterviewsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading placeholder instead of the empty state while the request is in flight', () => {
    mockGqlRequest.mockReturnValue(new Promise(() => {}));
    render(<InterviewsTab {...baseProps} />, { wrapper: Wrapper });

    expect(screen.queryByText('No interview rounds yet.')).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no rounds', async () => {
    mockGqlRequest.mockResolvedValue({ interviewRounds: [] });
    render(<InterviewsTab {...baseProps} />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('No interview rounds yet.')).toBeInTheDocument();
    });
  });

  it('renders an existing round with its outcome and interviewer', async () => {
    mockGqlRequest.mockResolvedValue({ interviewRounds: [mockRound] });
    render(<InterviewsTab {...baseProps} />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Technical')).toBeInTheDocument();
    });
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('with Alex Kim')).toBeInTheDocument();
  });

  it("shows each round's question count", async () => {
    mockGqlRequest.mockResolvedValue({
      interviewRounds: [
        mockRound,
        { ...mockRound, id: 'round-2', type: 'phone', questionCount: 0 },
      ],
    });
    render(<InterviewsTab {...baseProps} />, { wrapper: Wrapper });

    expect(await screen.findByRole('button', { name: '3 questions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No questions yet' })).toBeInTheDocument();
  });

  it("shows each round's practice question count apart from its asked-question count (JEF-393)", async () => {
    mockGqlRequest.mockResolvedValue({
      interviewRounds: [
        { ...mockRound, questionCount: 3, mockQuestionCount: 2 },
        { ...mockRound, id: 'round-2', type: 'phone', questionCount: 0, mockQuestionCount: 0 },
      ],
    });
    render(<InterviewsTab {...baseProps} />, { wrapper: Wrapper });

    expect(await screen.findByRole('button', { name: '3 questions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2 practice questions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No questions yet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Practice questions' })).toBeInTheDocument();
  });

  it('asks for the practice question count with the rounds', async () => {
    mockGqlRequest.mockResolvedValue({ interviewRounds: [mockRound] });
    render(<InterviewsTab {...baseProps} />, { wrapper: Wrapper });

    await screen.findByRole('button', { name: '3 questions' });

    expect(mockGqlRequest).toHaveBeenCalledWith(
      gqlContaining('mockQuestionCount'),
      expect.anything(),
    );
  });

  it.each(['passed', 'failed', 'cancelled'])(
    'still offers the questions for a round whose outcome is %s',
    async (outcome) => {
      mockGqlRequest.mockImplementation((query: unknown) =>
        Promise.resolve(
          gqlText(query).includes('query InterviewQuestions')
            ? {
                interviewQuestions: [
                  {
                    id: 'q1',
                    interviewRoundId: 'round-1',
                    question: 'Describe a hard bug.',
                    answer: null,
                    position: 0,
                    createdAt: '2024-01-01T00:00:00.000Z',
                    updatedAt: '2024-01-01T00:00:00.000Z',
                  },
                ],
              }
            : {
                interviewRounds: [
                  { ...mockRound, outcome, completedAt: '2024-06-01T16:00:00.000Z' },
                ],
              },
        ),
      );
      render(<InterviewsTab {...baseProps} />, { wrapper: Wrapper });

      fireEvent.click(await screen.findByRole('button', { name: '3 questions' }));

      expect(await screen.findByText('Describe a hard bug.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add question' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit question' })).toBeInTheDocument();
    },
  );

  it('shows the Export to Calendar button only when a round has a scheduled date', async () => {
    mockGqlRequest.mockResolvedValue({ interviewRounds: [{ ...mockRound, scheduledAt: null }] });
    render(<InterviewsTab {...baseProps} />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Technical')).toBeInTheDocument();
    });
    expect(screen.queryByText('Export to Calendar')).not.toBeInTheDocument();
  });

  it('creates a new interview round', async () => {
    mockGqlRequest.mockImplementation((query: unknown) => {
      if (gqlText(query).includes('CreateInterviewRound')) {
        return Promise.resolve({ createInterviewRound: { ...mockRound, id: 'round-2' } });
      }
      return Promise.resolve({ interviewRounds: [] });
    });
    render(<InterviewsTab {...baseProps} />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('No interview rounds yet.')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /add interview round/i }));
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(
        gqlContaining('CreateInterviewRound'),
        expect.objectContaining({
          input: expect.objectContaining({ applicationId: 'app-1', type: 'phone' }),
        }),
      );
    });
  });

  it('deletes an interview round', async () => {
    mockGqlRequest.mockImplementation((query: unknown) => {
      if (gqlText(query).includes('DeleteInterviewRound')) {
        return Promise.resolve({ deleteInterviewRound: true });
      }
      return Promise.resolve({ interviewRounds: [mockRound] });
    });
    render(<InterviewsTab {...baseProps} />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Technical')).toBeInTheDocument();
    });

    const card = screen.getByText('Technical').closest('div[class*="bg-white"]') as HTMLElement;
    fireEvent.click(within(card).getAllByRole('button')[1]);

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(
        gqlContaining('DeleteInterviewRound'),
        expect.objectContaining({ id: 'round-1' }),
      );
    });
  });

  describe('the round form (JEF-621)', () => {
    const createCalls = () =>
      mockGqlRequest.mock.calls.filter(([q]) => gqlText(q).includes('CreateInterviewRound'));
    const updateCalls = () =>
      mockGqlRequest.mock.calls.filter(([q]) => gqlText(q).includes('UpdateInterviewRound'));

    async function openAddForm() {
      render(<InterviewsTab {...baseProps} />, { wrapper: Wrapper });
      await screen.findByText('No interview rounds yet.');
      fireEvent.click(screen.getByRole('button', { name: /add interview round/i }));
      return screen.getByRole('button', { name: /^save$/i });
    }

    it('is a real form', async () => {
      mockGqlRequest.mockResolvedValue({ interviewRounds: [] });
      const save = await openAddForm();
      expect(save.closest('form')).not.toBeNull();
      expect(save).toHaveAttribute('type', 'submit');
    });

    it('submits on Enter', async () => {
      mockGqlRequest.mockImplementation((query: unknown) =>
        Promise.resolve(
          gqlText(query).includes('CreateInterviewRound')
            ? { createInterviewRound: { ...mockRound, id: 'round-2' } }
            : { interviewRounds: [] },
        ),
      );
      await openAddForm();

      await userEvent.type(screen.getByPlaceholderText('Name or team'), 'Sam{Enter}');

      await waitFor(() => expect(createCalls()).toHaveLength(1));
      expect(createCalls()[0][1]).toEqual({
        input: expect.objectContaining({ interviewerName: 'Sam' }),
      });
    });

    it('creates once on a double click', async () => {
      let release: (value: unknown) => void = () => {};
      mockGqlRequest.mockImplementation((query: unknown) =>
        gqlText(query).includes('CreateInterviewRound')
          ? new Promise((resolve) => {
              release = resolve;
            })
          : Promise.resolve({ interviewRounds: [] }),
      );
      const save = await openAddForm();

      fireEvent.click(save);
      await waitFor(() => expect(createCalls()).toHaveLength(1));
      fireEvent.click(save);
      release({ createInterviewRound: { ...mockRound, id: 'round-2' } });

      await waitFor(() => expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull());
      expect(createCalls()).toHaveLength(1);
    });

    it('shows a failed save under the form and keeps what was typed', async () => {
      mockGqlRequest.mockImplementation((query: unknown) =>
        gqlText(query).includes('CreateInterviewRound')
          ? Promise.reject({
              response: {
                errors: [{ message: 'Round limit reached', extensions: { code: 'VALIDATION' } }],
              },
            })
          : Promise.resolve({ interviewRounds: [] }),
      );
      const save = await openAddForm();
      fireEvent.change(screen.getByDisplayValue('Phone'), { target: { value: 'onsite' } });

      fireEvent.click(save);

      expect(await screen.findByText('Round limit reached')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Onsite')).toBeInTheDocument();
    });

    it('closes the form on Cancel without saving', async () => {
      mockGqlRequest.mockResolvedValue({ interviewRounds: [] });
      await openAddForm();

      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

      expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull();
      expect(createCalls()).toHaveLength(0);
    });

    it('edits a round from its current values', async () => {
      mockGqlRequest.mockImplementation((query: unknown) =>
        Promise.resolve(
          gqlText(query).includes('UpdateInterviewRound')
            ? { updateInterviewRound: { ...mockRound, outcome: 'passed' } }
            : { interviewRounds: [mockRound] },
        ),
      );
      render(<InterviewsTab {...baseProps} />, { wrapper: Wrapper });
      await screen.findByText('with Alex Kim');
      const card = screen
        .getByText('with Alex Kim')
        .closest('div[class*="bg-white"]') as HTMLElement;
      fireEvent.click(within(card).getAllByRole('button')[0]);

      expect(await screen.findByDisplayValue('Alex Kim')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Discuss system design')).toBeInTheDocument();
      fireEvent.change(screen.getByDisplayValue('Pending'), { target: { value: 'passed' } });
      fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

      await waitFor(() => expect(updateCalls()).toHaveLength(1));
      expect(updateCalls()[0][1]).toEqual({
        id: 'round-1',
        input: expect.objectContaining({ type: 'technical', outcome: 'passed' }),
      });
    });
  });
});
