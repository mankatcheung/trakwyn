import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  MockQuestionCard,
  type MockQuestionCardProps,
} from '#/features/interviews/components/mock/MockQuestionCard';
import type { MockQuestion } from '#/features/interviews/graphql/mockQuestionApi';

vi.mock('#/graphql/client', () => ({ gqlClient: { request: vi.fn() } }));

const question: MockQuestion = {
  id: 'mock-1',
  interviewRoundId: 'round-1',
  question: 'Tell me about a hard bug.',
  answer: null,
  answerSource: 'user',
  talkingPoints: null,
  talkingPointsGeneratedAt: null,
  position: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

function renderCard(overrides: Partial<MockQuestionCardProps> = {}) {
  const handlers = {
    onEdit: vi.fn(),
    onGenerateAnswer: vi.fn(),
    onMove: vi.fn(),
    onDelete: vi.fn(),
    onSaveDraft: vi.fn(),
    onDiscardDraft: vi.fn(),
    onTalkingPointsSaved: vi.fn(),
  };
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MockQuestionCard
        applicationId="app-1"
        question={question}
        index={1}
        total={3}
        reorderDisabled={false}
        draft={null}
        generatingAnswer={false}
        generatingForThis={false}
        savingDraft={false}
        saveDraftError={null}
        {...handlers}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return handlers;
}

describe('MockQuestionCard', () => {
  it('shows the question and a written answer without an AI label', () => {
    renderCard({ question: { ...question, answer: 'I bisected it.' } });

    expect(screen.getByText('Tell me about a hard bug.')).toBeInTheDocument();
    expect(screen.getByText('I bisected it.')).toBeInTheDocument();
    expect(screen.queryByText('AI generated')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Write answer' })).toBeNull();
  });

  it('labels an answer that began as an AI draft', () => {
    renderCard({ question: { ...question, answer: 'I bisected it.', answerSource: 'ai' } });

    expect(screen.getByText('AI generated')).toBeInTheDocument();
  });

  it('offers to write or generate an answer when there is none', () => {
    const { onEdit, onGenerateAnswer } = renderCard();

    expect(screen.getByText('No answer yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Write answer' }));
    fireEvent.click(screen.getByRole('button', { name: /Generate answer with AI/ }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onGenerateAnswer).toHaveBeenCalledTimes(1);
  });

  it('disables generating while an answer is being generated, and says so on that question', () => {
    renderCard({ generatingAnswer: true, generatingForThis: true });

    const generating = screen.getByRole('button', { name: /Generating…/ });
    expect(generating).toBeDisabled();
  });

  it('disables generating on a question that is not the one being generated', () => {
    renderCard({ generatingAnswer: true, generatingForThis: false });

    expect(screen.getByRole('button', { name: /Generate answer with AI/ })).toBeDisabled();
  });

  it('shows the AI answer draft in place of the write and generate choices', () => {
    renderCard({ draft: { text: 'A drafted answer', usedProfile: true } });

    expect(screen.getByDisplayValue('A drafted answer')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Write answer' })).toBeNull();
  });

  it('moves, edits and deletes through its handlers', () => {
    const { onMove, onEdit, onDelete } = renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Move question up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move question down' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit question' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete question' }));

    expect(onMove.mock.calls).toEqual([[-1], [1]]);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('cannot move the first question up', () => {
    renderCard({ index: 0, total: 3 });
    expect(screen.getByRole('button', { name: 'Move question up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move question down' })).toBeEnabled();
  });

  it('cannot move the last question down', () => {
    renderCard({ index: 2, total: 3 });

    expect(screen.getByRole('button', { name: 'Move question down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move question up' })).toBeEnabled();
  });

  it('locks both move buttons while a reorder or a delete is pending', () => {
    renderCard({ reorderDisabled: true });

    expect(screen.getByRole('button', { name: 'Move question up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move question down' })).toBeDisabled();
  });
});
