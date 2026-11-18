import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MockAnswerDraft } from '#/features/interviews/components/mock/MockAnswerDraft';

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

function setup(props: Partial<Parameters<typeof MockAnswerDraft>[0]> = {}) {
  const handlers = { onSave: vi.fn(), onDiscard: vi.fn() };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MockAnswerDraft
        questionId="q1"
        initialDraft="First draft"
        initialUsedProfile={false}
        saving={false}
        saveError={null}
        {...handlers}
        {...props}
      />
    </QueryClientProvider>,
  );
  return handlers;
}

const answer = () => screen.getByRole('textbox', { name: 'Your answer' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MockAnswerDraft', () => {
  it('shows the draft as an AI suggestion to review', () => {
    setup();

    expect(answer()).toHaveValue('First draft');
    expect(screen.getByText('AI generated draft')).toBeInTheDocument();
    expect(screen.getByText('Review it before you rely on it.')).toBeInTheDocument();
    expect(screen.queryByText(/Drafted using your profile/)).not.toBeInTheDocument();
  });

  it('says when the draft was written from the profile', () => {
    setup({ initialUsedProfile: true });

    expect(screen.getByText(/Drafted using your profile/)).toBeInTheDocument();
  });

  it('saves what is in the box, edits included', () => {
    const { onSave } = setup();

    fireEvent.change(answer(), { target: { value: 'My own words' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save answer' }));

    expect(onSave).toHaveBeenCalledExactlyOnceWith('My own words');
  });

  it('will not save an empty answer', () => {
    setup();

    fireEvent.change(answer(), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: 'Save answer' })).toBeDisabled();
  });

  it('discards the draft', () => {
    const { onDiscard } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));

    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it('locks both buttons while saving', () => {
    setup({ saving: true });

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard draft' })).toBeDisabled();
  });

  it('shows the error from the save', () => {
    setup({ saveError: 'Could not save' });

    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
  });

  it('replaces the draft with a regenerated one and notes the profile use', async () => {
    mockGqlRequest.mockResolvedValue({
      generateMockInterviewAnswer: { answer: 'Second draft', usedProfile: true },
    });
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));

    await waitFor(() => expect(answer()).toHaveValue('Second draft'));
    expect(screen.getByText(/Drafted using your profile/)).toBeInTheDocument();
    expect(mockGqlRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mockInterviewQuestionId: 'q1', prompt: null }),
    );
  });

  it('sends the instructions once they are opened and typed', async () => {
    mockGqlRequest.mockResolvedValue({
      generateMockInterviewAnswer: { answer: 'Shorter', usedProfile: false },
    });
    setup();

    const toggle = screen.getByRole('button', { name: 'Add instructions' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide instructions' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: '  Make it short ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));

    await waitFor(() => expect(answer()).toHaveValue('Shorter'));
    expect(mockGqlRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ prompt: 'Make it short' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hide instructions' }));
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('shows the error when regenerating fails and keeps the draft', async () => {
    mockGqlRequest.mockRejectedValue(gqlError('No credits left'));
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No credits left');
    expect(answer()).toHaveValue('First draft');
  });
});
