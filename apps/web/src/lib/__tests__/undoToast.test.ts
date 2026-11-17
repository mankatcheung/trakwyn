import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockGqlRequest, mockToast } = vi.hoisted(() => {
  const toastFn = vi.fn();
  return {
    mockGqlRequest: vi.fn(),
    mockToast: Object.assign(toastFn, { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
  };
});

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));
vi.mock('sonner', () => ({ toast: mockToast }));

import { showUndoToast } from '#/lib/undoToast';
import { replayPendingOperations } from '#/lib/pendingOperations';

const STORAGE_KEY = 'trakwyn:pendingOperations';
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown[];

const clickUndo = () => {
  const [, options] = mockToast.mock.calls.at(-1) as [string, { action: { onClick: () => void } }];
  options.action.onClick();
};

const deleteNote = { document: 'mutation DeleteNote($id: ID!)', variables: { id: 'n1' } };

describe('showUndoToast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.clear();
    mockGqlRequest.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('holds the request until the undo window closes', async () => {
    showUndoToast({ message: 'Note deleted', operation: deleteNote, onUndo: vi.fn() });

    expect(mockGqlRequest).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5000);

    expect(mockGqlRequest).toHaveBeenCalledWith(deleteNote.document, deleteNote.variables);
  });

  it('records the operation durably while it waits', () => {
    showUndoToast({ message: 'Note deleted', operation: deleteNote, onUndo: vi.fn() });

    // This is the fix: the pending delete exists somewhere other than a timer,
    // so a refresh right now does not lose it.
    expect(stored()).toHaveLength(1);
  });

  it('a page that reloads mid-window still sends the delete', async () => {
    showUndoToast({ message: 'Note deleted', operation: deleteNote, onUndo: vi.fn() });

    // Standing in for a refresh: the timer is gone, the record is not.
    vi.clearAllTimers();
    expect(mockGqlRequest).not.toHaveBeenCalled();

    await replayPendingOperations();

    expect(mockGqlRequest).toHaveBeenCalledWith(deleteNote.document, deleteNote.variables);
    expect(stored()).toEqual([]);
  });

  it('clears the record once the request has gone out', async () => {
    showUndoToast({ message: 'Note deleted', operation: deleteNote, onUndo: vi.fn() });

    await vi.advanceTimersByTimeAsync(5000);

    expect(stored()).toEqual([]);
  });

  it('undo cancels the request and the record with it', async () => {
    const onUndo = vi.fn();
    showUndoToast({ message: 'Note deleted', operation: deleteNote, onUndo });

    clickUndo();

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(stored()).toEqual([]);

    // Nothing left to fire, and nothing for a later replay to pick up either.
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockGqlRequest).not.toHaveBeenCalled();
    await replayPendingOperations();
    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('runs onSettled after the request resolves', async () => {
    const onSettled = vi.fn();
    showUndoToast({ message: 'Note deleted', operation: deleteNote, onUndo: vi.fn(), onSettled });

    await vi.advanceTimersByTimeAsync(5000);

    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('surfaces a failure and still settles, rather than retrying forever', async () => {
    mockGqlRequest.mockRejectedValue(new Error('boom'));
    const onSettled = vi.fn();
    showUndoToast({ message: 'Note deleted', operation: deleteNote, onUndo: vi.fn(), onSettled });

    await vi.advanceTimersByTimeAsync(5000);

    expect(mockToast.error).toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(stored()).toEqual([]);
  });
});
