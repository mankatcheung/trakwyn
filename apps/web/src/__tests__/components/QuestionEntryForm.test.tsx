import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuestionEntryForm } from '#/routes/_authenticated/applications/$applicationId/-components/QuestionEntryForm';
import { INTERVIEW_QUESTION_LIMITS } from '#/routes/_authenticated/applications/$applicationId/-components/interviewQuestionLimits';

const renderForm = (
  onSubmit: (values: { question: string; answer: string }) => Promise<string | null>,
  initial = { question: '', answer: '' },
) =>
  render(
    <QuestionEntryForm
      idPrefix="test"
      initial={initial}
      questionPlaceholder="Question here"
      answerLabel="Your response"
      answerPlaceholder="Answer here"
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  );

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));

describe('QuestionEntryForm (JEF-619)', () => {
  it('submits the question and answer as typed', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null);
    renderForm(onSubmit);

    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Why us?' } });
    fireEvent.change(screen.getByLabelText(/Your response/), { target: { value: 'Because.' } });
    save();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      { question: 'Why us?', answer: 'Because.' },
      expect.anything(),
    );
  });

  it('starts from the values it is given', () => {
    renderForm(vi.fn(), { question: 'Existing', answer: 'Old answer' });

    expect(screen.getByLabelText('Question')).toHaveValue('Existing');
    expect(screen.getByLabelText(/Your response/)).toHaveValue('Old answer');
  });

  it('rejects a blank question without calling onSubmit', async () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit);

    fireEvent.change(screen.getByLabelText('Question'), { target: { value: '   ' } });
    save();

    expect(await screen.findByText('Enter a question')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('enforces the question limit in the schema, whatever the input allows', async () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit);
    const tooLong = 'q'.repeat(INTERVIEW_QUESTION_LIMITS.QUESTION_MAX_CHARS + 1);

    // fireEvent skips `maxLength`, as a paste or autofill can.
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: tooLong } });
    save();

    expect(
      await screen.findByText(
        `Must be at most ${INTERVIEW_QUESTION_LIMITS.QUESTION_MAX_CHARS} characters`,
      ),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('enforces the answer limit in the schema', async () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit);

    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Fine' } });
    fireEvent.change(screen.getByLabelText(/Your response/), {
      target: { value: 'a'.repeat(INTERVIEW_QUESTION_LIMITS.ANSWER_MAX_CHARS + 1) },
    });
    save();

    expect(
      await screen.findByText(
        `Must be at most ${INTERVIEW_QUESTION_LIMITS.ANSWER_MAX_CHARS} characters`,
      ),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the message onSubmit returns and keeps the input', async () => {
    renderForm(vi.fn().mockResolvedValue('The round is full'));

    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Why us?' } });
    fireEvent.change(screen.getByLabelText(/Your response/), { target: { value: 'Because.' } });
    save();

    expect(await screen.findByRole('alert')).toHaveTextContent('The round is full');
    expect(screen.getByLabelText('Question')).toHaveValue('Why us?');
    expect(screen.getByLabelText(/Your response/)).toHaveValue('Because.');
  });

  it('submits once when the button is double clicked', async () => {
    let finish: (message: string | null) => void = () => {};
    const onSubmit = vi.fn(() => new Promise<string | null>((resolve) => (finish = resolve)));
    renderForm(onSubmit);

    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Why us?' } });
    const button = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
    finish(null);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
