import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockShowUndoToast } = vi.hoisted(() => ({ mockShowUndoToast: vi.fn() }));
vi.mock('#/lib/undoToast', () => ({ showUndoToast: mockShowUndoToast }));

import { deleteProfileItemWithUndo } from '#/routes/_authenticated/profile/-components/deleteProfileItemWithUndo';

type Skill = { id: string; name: string };
const KEY = ['skills'] as const;
const DELETE_DOC = 'mutation DeleteSkill($id: ID!) { deleteSkill(id: $id) }';

const SKILLS: Skill[] = [
  { id: 's1', name: 'TypeScript' },
  { id: 's2', name: 'Go' },
  { id: 's3', name: 'SQL' },
];

function setup(initial: { skills: Skill[] } | null = { skills: SKILLS }) {
  const qc = new QueryClient();
  if (initial) qc.setQueryData(KEY, initial);
  const run = (id: string) =>
    deleteProfileItemWithUndo({
      qc,
      queryKey: KEY,
      id,
      document: DELETE_DOC,
      message: 'Deleted',
    });
  const names = () => qc.getQueryData<{ skills: Skill[] }>(KEY)?.skills.map((s) => s.name);
  /** The options the last undo toast was opened with. */
  const toastOptions = () => mockShowUndoToast.mock.lastCall![0];
  return { qc, run, names, toastOptions };
}

describe('deleteProfileItemWithUndo', () => {
  beforeEach(() => mockShowUndoToast.mockReset());

  it('removes the row from the cache at once', () => {
    const { run, names } = setup();
    run('s2');
    expect(names()).toEqual(['TypeScript', 'SQL']);
  });

  it('defers the delete request to the undo toast, with the id', () => {
    const { run, toastOptions } = setup();
    run('s2');
    expect(mockShowUndoToast).toHaveBeenCalledTimes(1);
    expect(toastOptions()).toMatchObject({
      message: 'Deleted',
      operation: { document: DELETE_DOC, variables: { id: 's2' } },
    });
  });

  it('undo puts the row back where it was', () => {
    const { run, names, toastOptions } = setup();
    run('s2');
    toastOptions().onUndo();
    expect(names()).toEqual(['TypeScript', 'Go', 'SQL']);
  });

  it('undoing one delete does not bring back another that is still pending', () => {
    const { run, names } = setup();
    run('s1');
    const undoFirst = mockShowUndoToast.mock.lastCall![0].onUndo;
    run('s3');
    undoFirst();
    expect(names()).toEqual(['TypeScript', 'Go']);
  });

  it('undo does not duplicate a row a refetch already brought back', () => {
    const { qc, run, names, toastOptions } = setup();
    run('s2');
    qc.setQueryData(KEY, { skills: SKILLS });
    toastOptions().onUndo();
    expect(names()).toEqual(['TypeScript', 'Go', 'SQL']);
  });

  it('refetches the list once the request has settled', () => {
    const { qc, run, toastOptions } = setup();
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    run('s2');
    toastOptions().onSettled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY });
  });

  it('still schedules the delete when the list was never cached', () => {
    const { run, names, toastOptions } = setup(null);
    expect(() => run('s2')).not.toThrow();
    expect(names()).toBeUndefined();
    expect(toastOptions().operation.variables).toEqual({ id: 's2' });
  });

  it('leaves the cache alone for an id that is not in the list', () => {
    const { run, names } = setup();
    run('missing');
    expect(names()).toEqual(['TypeScript', 'Go', 'SQL']);
  });
});
