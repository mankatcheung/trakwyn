import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

import { InterviewsTab } from '#/routes/_authenticated/applications/$applicationId/-components/InterviewsTab';

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
      expect.stringContaining('mockQuestionCount'),
      expect.anything(),
    );
  });

  it.each(['passed', 'failed', 'cancelled'])(
    'still offers the questions for a round whose outcome is %s',
    async (outcome) => {
      mockGqlRequest.mockImplementation((query: string) =>
        Promise.resolve(
          query.includes('query InterviewQuestions')
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
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('CreateInterviewRound')) {
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
        expect.stringContaining('CreateInterviewRound'),
        expect.objectContaining({
          input: expect.objectContaining({ applicationId: 'app-1', type: 'phone' }),
        }),
      );
    });
  });

  it('deletes an interview round', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('DeleteInterviewRound')) {
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
        expect.stringContaining('DeleteInterviewRound'),
        expect.objectContaining({ id: 'round-1' }),
      );
    });
  });
});
