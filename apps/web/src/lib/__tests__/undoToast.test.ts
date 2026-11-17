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

import { parse } from 'graphql';
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

  describe('with a typed document', () => {
    // `graphql()` hands back an AST; storage and replay deal in text.
    const typedDelete = {
      document: parse('mutation DeleteNote($id: ID!) { deleteNote(id: $id) }'),
      variables: { id: 'n1' },
    };

    it('sends the printed document once the window closes', async () => {
      showUndoToast({ message: 'Note deleted', operation: typedDelete, onUndo: vi.fn() });

      await vi.advanceTimersByTimeAsync(5000);

      expect(mockGqlRequest).toHaveBeenCalledTimes(1);
      const [sent, variables] = mockGqlRequest.mock.calls[0];
      expect(typeof sent).toBe('string');
      expect(sent).toContain('mutation DeleteNote($id: ID!)');
      expect(sent).toContain('deleteNote(id: $id)');
      expect(variables).toEqual({ id: 'n1' });
    });

    it('records the printed text, so a reload can replay it', async () => {
      showUndoToast({ message: 'Note deleted', operation: typedDelete, onUndo: vi.fn() });

      const [record] = stored() as { document: unknown; variables: unknown }[];
      expect(typeof record.document).toBe('string');
      expect(record.document).toContain('deleteNote(id: $id)');

      // Standing in for a refresh: the timer is gone, the record is not.
      vi.clearAllTimers();
      await replayPendingOperations();

      expect(mockGqlRequest).toHaveBeenCalledWith(record.document, { id: 'n1' });
    });

    it('sends nothing after Undo', async () => {
      showUndoToast({ message: 'Note deleted', operation: typedDelete, onUndo: vi.fn() });

      clickUndo();
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockGqlRequest).not.toHaveBeenCalled();
      expect(stored()).toHaveLength(0);
    });
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
