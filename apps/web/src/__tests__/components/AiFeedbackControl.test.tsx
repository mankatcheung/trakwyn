import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('#/graphql/client', () => ({ gqlClient: { request: m.request } }));

import { AiFeedbackControl } from '#/components/AiFeedbackControl';
import type { AiRating } from '#/lib/aiFeedback';

function setup(rating: AiRating | null = null) {
  const onChange = vi.fn();
  render(
    <AiFeedbackControl
      targetKind="CHAT_MESSAGE"
      targetId="msg-1"
      rating={rating}
      onChange={onChange}
    />,
  );
  return { onChange };
}

const up = () => screen.getByRole('button', { name: 'Good response' });
const down = () => screen.getByRole('button', { name: 'Bad response' });
const calls = (name: string) => m.request.mock.calls.filter(([q]) => String(q).includes(name));

describe('AiFeedbackControl (JEF-547)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.request.mockResolvedValue({});
  });

  it('starts with neither thumb chosen', () => {
    setup();
    expect(up()).toHaveAttribute('aria-pressed', 'false');
    expect(down()).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows a rating that was stored, so it survives a reload', () => {
    setup({ rating: 'UP', reason: null });
    expect(up()).toHaveAttribute('aria-pressed', 'true');
    expect(down()).toHaveAttribute('aria-pressed', 'false');
  });

  it('saves a thumbs up by kind and id, and tells the parent', async () => {
    const { onChange } = setup();

    fireEvent.click(up());

    expect(up()).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ rating: 'UP', reason: null }));
    expect(calls('RateAiOutput')[0][1]).toEqual({
      targetKind: 'CHAT_MESSAGE',
      targetId: 'msg-1',
      rating: 'UP',
      reason: null,
    });
  });

  it('saves a thumbs down at once and then offers the fixed list of reasons', async () => {
    setup();

    fireEvent.click(down());

    await waitFor(() => expect(calls('RateAiOutput')).toHaveLength(1));
    expect(calls('RateAiOutput')[0][1]).toMatchObject({ rating: 'DOWN', reason: null });
    const picker = screen.getByRole('group', { name: 'What went wrong? (optional)' });
    expect(picker).toBeInTheDocument();
    for (const label of [
      'Wrong or made up',
      'Ignored my request',
      'Unsafe or inappropriate',
      'Not useful',
      'Something else',
      'Skip',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    // Nothing free-text: the only controls are buttons.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('records the chosen reason on the down-vote and closes the picker', async () => {
    const { onChange } = setup();
    fireEvent.click(down());
    await waitFor(() => expect(calls('RateAiOutput')).toHaveLength(1));

    fireEvent.click(await screen.findByRole('button', { name: 'Wrong or made up' }));

    await waitFor(() => expect(calls('RateAiOutput')).toHaveLength(2));
    expect(calls('RateAiOutput')[1][1]).toMatchObject({
      rating: 'DOWN',
      reason: 'WRONG_OR_MADE_UP',
    });
    expect(onChange).toHaveBeenLastCalledWith({ rating: 'DOWN', reason: 'WRONG_OR_MADE_UP' });
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(down()).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the down-vote when the reason is skipped', async () => {
    setup();
    fireEvent.click(down());
    await waitFor(() => expect(calls('RateAiOutput')).toHaveLength(1));

    fireEvent.click(await screen.findByRole('button', { name: 'Skip' }));

    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(down()).toHaveAttribute('aria-pressed', 'true');
    expect(calls('RateAiOutput')).toHaveLength(1);
  });

  it('replaces the rating when the other thumb is pressed', async () => {
    setup({ rating: 'UP', reason: null });

    fireEvent.click(down());

    await waitFor(() => expect(calls('RateAiOutput')).toHaveLength(1));
    expect(down()).toHaveAttribute('aria-pressed', 'true');
    expect(up()).toHaveAttribute('aria-pressed', 'false');
  });

  it('takes the rating back when the chosen thumb is pressed again', async () => {
    const { onChange } = setup({ rating: 'UP', reason: null });

    fireEvent.click(up());

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
    expect(calls('ClearAiOutputRating')[0][1]).toEqual({
      targetKind: 'CHAT_MESSAGE',
      targetId: 'msg-1',
    });
    expect(calls('RateAiOutput')).toHaveLength(0);
    expect(up()).toHaveAttribute('aria-pressed', 'false');
  });

  it('puts the thumbs back and says so when the API refuses', async () => {
    m.request.mockRejectedValue(new Error('network down'));
    const { onChange } = setup();

    fireEvent.click(up());

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save your feedback.");
    expect(up()).toHaveAttribute('aria-pressed', 'false');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('follows a rating that changes underneath it', () => {
    const { rerender } = render(
      <AiFeedbackControl targetKind="CHAT_MESSAGE" targetId="msg-1" rating={null} />,
    );
    expect(up()).toHaveAttribute('aria-pressed', 'false');

    rerender(
      <AiFeedbackControl
        targetKind="CHAT_MESSAGE"
        targetId="msg-1"
        rating={{ rating: 'UP', reason: null }}
      />,
    );

    expect(up()).toHaveAttribute('aria-pressed', 'true');
  });
});
