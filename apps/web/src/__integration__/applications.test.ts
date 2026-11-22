import type { QueryClient } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import {
  BULK_UPDATE_APPLICATION,
  CREATE_APPLICATION,
  DELETE_APPLICATION,
} from '#/features/applications/graphql/applicationMutations';
import { applicationsPageQueryOptions } from '#/features/applications/graphql/applicationsPageQueries';
import {
  MOVE_ON_BOARD,
  boardApplicationsQueryOptions,
} from '#/features/applications/graphql/boardQueries';
import {
  BULK_RESTORE_APPLICATIONS,
  PERMANENTLY_DELETE_APPLICATION,
  RESTORE_APPLICATION,
  trashedApplicationsQueryOptions,
} from '#/features/applications/graphql/trashQueries';
import { applicationQueryOptions } from '#/features/application-detail/graphql/applicationQuery';
import { UPDATE_APPLICATION_FLAGS } from '#/features/application-detail/graphql/applicationDetailQueries';
import type { ApplicationStatus } from '#/graphql/generated/graphql';
import {
  createApplication,
  newTestQueryClient,
  registerFreshUser,
  field,
} from './support/fixtures';

/**
 * The application documents against a real API: a create reaches the list, a
 * status change and a board move survive a refetch, and a trashed application
 * leaves the list for Trash (the `deletedAt` filter in
 * `DrizzleApplicationRepository`) and comes back on restore. Each assertion
 * follows a fresh `query`.
 *
 * One account per file; every test makes its own applications under a company
 * name of its own, so the suites cannot see each other's rows.
 */

describe('applications against a real API', () => {
  let client: QueryClient;
  let company: string;
  let testNumber = 0;

  /** This test's applications on the list, found by company so other tests' rows do not count. */
  const listed = async (status?: string) => {
    const result = await client.infiniteQuery(
      applicationsPageQueryOptions(status, undefined, company, undefined),
    );
    return result.pages.flatMap((page) => page.applicationsPage.items);
  };
  const board = async () =>
    (await client.query(boardApplicationsQueryOptions)).applications.filter(
      (a) => a.company === company,
    );
  const trashed = async () =>
    (await client.query(trashedApplicationsQueryOptions())).trashedApplications.filter(
      (a) => a.company === company,
    );
  const make = (role: string, status: ApplicationStatus = 'applied') =>
    createApplication({ company, role, status });

  beforeAll(async () => {
    await registerFreshUser('apps');
  });

  beforeEach(() => {
    client = newTestQueryClient();
    company = `Company${(testNumber += 1)}`;
  });

  it('lists a created application with what it was created with', async () => {
    const created = field(
      await gqlClient.request(CREATE_APPLICATION, {
        input: { company, role: 'Staff Engineer', status: 'draft', tags: ['remote'] },
      }),
      'createApplication',
    );

    expect(await listed()).toEqual([
      expect.objectContaining({
        id: created.id,
        company,
        role: 'Staff Engineer',
        status: 'draft',
        tags: ['remote'],
        starred: false,
      }),
    ]);
    const detail = await client.query(applicationQueryOptions(created.id));
    expect(detail.application).toMatchObject({ id: created.id, company, deletedAt: null });
  });

  it('keeps an edit and a status change after a refetch, and filters the list by status', async () => {
    const id = await make('Engineer', 'applied');

    await gqlClient.request(BULK_UPDATE_APPLICATION, { id, input: { role: 'Principal Engineer' } });
    await gqlClient.request(UPDATE_APPLICATION_FLAGS, {
      id,
      input: { status: 'interviewing', starred: true },
    });

    expect((await client.query(applicationQueryOptions(id))).application).toMatchObject({
      role: 'Principal Engineer',
      status: 'interviewing',
      starred: true,
    });
    expect(await listed('interviewing')).toHaveLength(1);
    expect(await listed('applied')).toEqual([]);
  });

  it('keeps a board move, in the column it was dropped into and at the position given', async () => {
    const first = await make('First', 'applied');
    const second = await make('Second', 'applied');
    const moved = await make('Moved', 'draft');

    // Dropped between the two in the "applied" column.
    const moveApplicationOnBoard = field(
      await gqlClient.request(MOVE_ON_BOARD, {
        input: { applicationId: moved, toStatus: 'applied', orderedIds: [first, moved, second] },
      }),
      'moveApplicationOnBoard',
    );
    // The answer is the whole renumbered column, in order.
    expect(moveApplicationOnBoard.map((a) => [a.id, a.status, a.boardPosition])).toEqual([
      [first, 'applied', 0],
      [moved, 'applied', 1],
      [second, 'applied', 2],
    ]);

    const column = (await board())
      .filter((a) => a.status === 'applied')
      .sort((a, b) => a.boardPosition - b.boardPosition);
    expect(column.map((a) => a.id)).toEqual([first, moved, second]);
    expect((await board()).filter((a) => a.status === 'draft')).toEqual([]);
    expect((await client.query(applicationQueryOptions(moved))).application.status).toBe('applied');
  });

  it('moves a trashed application from the list to Trash, and back on restore', async () => {
    const keep = await make('Keep');
    const gone = await make('Gone');

    await gqlClient.request(DELETE_APPLICATION, { id: gone });

    expect((await listed()).map((a) => a.id)).toEqual([keep]);
    expect((await board()).map((a) => a.id)).toEqual([keep]);
    const inTrash = await trashed();
    expect(inTrash.map((a) => a.id)).toEqual([gone]);
    expect(inTrash[0].deletedAt).not.toBeNull();
    expect(inTrash[0].purgeAt).not.toBeNull();
    // The detail query still reads it, marked trashed, so the page renders read-only.
    expect(
      (await client.query(applicationQueryOptions(gone))).application.deletedAt,
    ).not.toBeNull();

    await gqlClient.request(RESTORE_APPLICATION, { id: gone });

    expect((await listed()).map((a) => a.id).sort()).toEqual([keep, gone].sort());
    expect(await trashed()).toEqual([]);
    expect((await client.query(applicationQueryOptions(gone))).application.deletedAt).toBeNull();
  });

  it('restores several at once', async () => {
    const ids = [await make('A'), await make('B')];
    for (const id of ids) await gqlClient.request(DELETE_APPLICATION, { id });
    expect(await trashed()).toHaveLength(2);

    const bulkRestoreApplications = field(
      await gqlClient.request(BULK_RESTORE_APPLICATIONS, { ids }),
      'bulkRestoreApplications',
    );

    expect(bulkRestoreApplications.restored).toBe(2);
    expect(await trashed()).toEqual([]);
    expect(await listed()).toHaveLength(2);
  });

  it('removes a permanently deleted application from the list and from Trash', async () => {
    const id = await make('Doomed');
    await gqlClient.request(DELETE_APPLICATION, { id });

    await gqlClient.request(PERMANENTLY_DELETE_APPLICATION, { id });

    expect(await listed()).toEqual([]);
    expect(await trashed()).toEqual([]);
    await expect(client.query(applicationQueryOptions(id))).rejects.toThrow();
  });
});
