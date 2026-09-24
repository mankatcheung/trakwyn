import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';
import { TRASH } from '#src/use-cases/constants.js';

const REGISTER_MUTATION = `
  mutation Register($email: String!, $password: String!) {
    register(email: $email, password: $password)
  }
`;

const CREATE_APPLICATION_MUTATION = `
  mutation CreateApplication($input: CreateApplicationInput!) {
    createApplication(input: $input) {
      id
      company
      role
      status
      starred
    }
  }
`;

const APPLICATION_QUERY = `
  query Application($id: ID!) {
    application(id: $id) {
      id
      company
      role
      status
      deletedAt
      purgeAt
    }
  }
`;

const APPLICATIONS_QUERY = `
  query Applications {
    applications {
      id
      company
    }
  }
`;

const UPDATE_APPLICATION_MUTATION = `
  mutation UpdateApplication($id: ID!, $input: UpdateApplicationInput!) {
    updateApplication(id: $id, input: $input) {
      id
      status
      starred
    }
  }
`;

const DELETE_APPLICATION_MUTATION = `
  mutation DeleteApplication($id: ID!) {
    deleteApplication(id: $id)
  }
`;

const TRASHED_QUERY = `
  query TrashedApplications {
    trashedApplications { id company deletedAt purgeAt }
  }
`;

const RESTORE_MUTATION = `
  mutation RestoreApplication($id: ID!) {
    restoreApplication(id: $id)
  }
`;

const BULK_RESTORE_MUTATION = `
  mutation BulkRestoreApplications($ids: [ID!]!) {
    bulkRestoreApplications(ids: $ids) { restored }
  }
`;

const EMPTY_TRASH_MUTATION = `
  mutation EmptyTrash {
    emptyTrash { deleted failed }
  }
`;

const PERMANENT_DELETE_MUTATION = `
  mutation PermanentlyDeleteApplication($id: ID!) {
    permanentlyDeleteApplication(id: $id)
  }
`;

interface GraphQLResponse<T> {
  data: T | null;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

describe('applications integration', () => {
  let testApp: TestApp;

  async function registerAndLogin(): Promise<string> {
    const email = `${randomUUID()}@example.com`;
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: REGISTER_MUTATION, variables: { email, password: 'correct-horse-1' } },
    });
    const body = res.json() as GraphQLResponse<{ register: string }>;
    return body.data!.register;
  }

  function authedInject(token: string, query: string, variables?: Record<string, unknown>) {
    return testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { authorization: `Bearer ${token}` },
      payload: { query, variables },
    });
  }

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  it('runs the full create → query → update → delete lifecycle through real mutations/queries', async () => {
    const token = await registerAndLogin();

    const createRes = await authedInject(token, CREATE_APPLICATION_MUTATION, {
      input: { company: 'Acme Corp', role: 'Staff Engineer', status: 'applied' },
    });
    const createBody = createRes.json() as GraphQLResponse<{
      createApplication: { id: string; company: string; role: string; status: string };
    }>;
    expect(createBody.errors).toBeUndefined();
    const app = createBody.data!.createApplication;
    expect(app).toMatchObject({ company: 'Acme Corp', role: 'Staff Engineer', status: 'applied' });

    const listRes = await authedInject(token, APPLICATIONS_QUERY);
    const listBody = listRes.json() as GraphQLResponse<{
      applications: Array<{ id: string; company: string }>;
    }>;
    expect(listBody.data!.applications.map((a) => a.id)).toContain(app.id);

    const getRes = await authedInject(token, APPLICATION_QUERY, { id: app.id });
    const getBody = getRes.json() as GraphQLResponse<{
      application: { id: string; company: string; role: string; status: string };
    }>;
    expect(getBody.data!.application).toMatchObject({ id: app.id, company: 'Acme Corp' });

    const updateRes = await authedInject(token, UPDATE_APPLICATION_MUTATION, {
      id: app.id,
      input: { status: 'interviewing', starred: true },
    });
    const updateBody = updateRes.json() as GraphQLResponse<{
      updateApplication: { id: string; status: string; starred: boolean };
    }>;
    expect(updateBody.data!.updateApplication).toEqual({
      id: app.id,
      status: 'interviewing',
      starred: true,
    });

    const deleteRes = await authedInject(token, DELETE_APPLICATION_MUTATION, { id: app.id });
    const deleteBody = deleteRes.json() as GraphQLResponse<{ deleteApplication: boolean }>;
    expect(deleteBody.data!.deleteApplication).toBe(true);

    // The detail query reads past the trash filter on purpose: a stale link to a
    // deleted application should land on the read-only Trash view that offers
    // restore, not a 404. `deletedAt` is what tells the client which one it got.
    const afterDeleteRes = await authedInject(token, APPLICATION_QUERY, { id: app.id });
    const afterDeleteBody = afterDeleteRes.json() as GraphQLResponse<{
      application: { id: string; deletedAt: string | null };
    }>;
    expect(afterDeleteBody.errors).toBeUndefined();
    expect(afterDeleteBody.data!.application).toMatchObject({ id: app.id });
    expect(afterDeleteBody.data!.application.deletedAt).toBeTruthy();
  });

  it('deleting hides an application everywhere and restoring brings it back', async () => {
    const token = await registerAndLogin();
    const created = await authedInject(token, CREATE_APPLICATION_MUTATION, {
      input: { company: 'Acme', role: 'Engineer', status: 'applied' },
    });
    const app = (created.json() as GraphQLResponse<{ createApplication: { id: string } }>).data!
      .createApplication;

    await authedInject(token, DELETE_APPLICATION_MUTATION, { id: app.id });

    // Gone from the list...
    const listed = await authedInject(token, APPLICATIONS_QUERY);
    const items = (listed.json() as GraphQLResponse<{ applications: Array<{ id: string }> }>).data!
      .applications;
    expect(items.map((a) => a.id)).not.toContain(app.id);

    // ...but present in Trash, carrying when it went there so the UI can count down.
    const trashed = await authedInject(token, TRASHED_QUERY);
    const inTrash = (
      trashed.json() as GraphQLResponse<{
        trashedApplications: Array<{
          id: string;
          deletedAt: string | null;
          purgeAt: string | null;
        }>;
      }>
    ).data!.trashedApplications;
    expect(inTrash.map((a) => a.id)).toEqual([app.id]);
    expect(inTrash[0].deletedAt).toBeTruthy();
    // purgeAt is derived from deletedAt + the retention window, so the Trash
    // screen counts down without shipping its own copy of the 30-day policy.
    expect(
      new Date(inTrash[0].purgeAt!).getTime() - new Date(inTrash[0].deletedAt!).getTime(),
    ).toBe(TRASH.RETENTION_MS);

    await authedInject(token, RESTORE_MUTATION, { id: app.id });

    const relisted = await authedInject(token, APPLICATIONS_QUERY);
    const back = (relisted.json() as GraphQLResponse<{ applications: Array<{ id: string }> }>).data!
      .applications;
    expect(back.map((a) => a.id)).toContain(app.id);
    const emptyTrash = await authedInject(token, TRASHED_QUERY);
    expect(
      (emptyTrash.json() as GraphQLResponse<{ trashedApplications: unknown[] }>).data!
        .trashedApplications,
    ).toEqual([]);
  });

  it("does not let one user see or restore another's trashed application", async () => {
    const owner = await registerAndLogin();
    const created = await authedInject(owner, CREATE_APPLICATION_MUTATION, {
      input: { company: 'Private', role: 'Engineer', status: 'applied' },
    });
    const app = (created.json() as GraphQLResponse<{ createApplication: { id: string } }>).data!
      .createApplication;
    await authedInject(owner, DELETE_APPLICATION_MUTATION, { id: app.id });

    const attacker = await registerAndLogin();

    const theirTrash = await authedInject(attacker, TRASHED_QUERY);
    expect(
      (theirTrash.json() as GraphQLResponse<{ trashedApplications: unknown[] }>).data!
        .trashedApplications,
    ).toEqual([]);

    const restore = await authedInject(attacker, RESTORE_MUTATION, { id: app.id });
    expect((restore.json() as GraphQLResponse<unknown>).errors?.[0]?.extensions?.code).toBe(
      'FORBIDDEN',
    );

    // And the owner still has it.
    const stillThere = await authedInject(owner, TRASHED_QUERY);
    expect(
      (
        stillThere.json() as GraphQLResponse<{ trashedApplications: Array<{ id: string }> }>
      ).data!.trashedApplications.map((a) => a.id),
    ).toEqual([app.id]);
  });

  it('permanently deleting removes it for good', async () => {
    const token = await registerAndLogin();
    const created = await authedInject(token, CREATE_APPLICATION_MUTATION, {
      input: { company: 'Acme', role: 'Engineer', status: 'applied' },
    });
    const app = (created.json() as GraphQLResponse<{ createApplication: { id: string } }>).data!
      .createApplication;
    await authedInject(token, DELETE_APPLICATION_MUTATION, { id: app.id });

    await authedInject(token, PERMANENT_DELETE_MUTATION, { id: app.id });

    const trashed = await authedInject(token, TRASHED_QUERY);
    expect(
      (trashed.json() as GraphQLResponse<{ trashedApplications: unknown[] }>).data!
        .trashedApplications,
    ).toEqual([]);
    const restore = await authedInject(token, RESTORE_MUTATION, { id: app.id });
    expect((restore.json() as GraphQLResponse<unknown>).errors?.[0]?.extensions?.code).toBe(
      'NOT_FOUND',
    );
  });

  it('rejects createApplication with no Authorization header', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query: CREATE_APPLICATION_MUTATION,
        variables: { input: { company: 'Acme', role: 'Engineer' } },
      },
    });
    const body = res.json() as GraphQLResponse<{ createApplication: null }>;
    expect(body.data).toEqual({ createApplication: null });
    expect(body.errors?.[0]?.extensions?.code).toBe('UNAUTHORIZED');
  });

  it("forbids one user from reading another user's application", async () => {
    const ownerToken = await registerAndLogin();
    const otherToken = await registerAndLogin();

    const createRes = await authedInject(ownerToken, CREATE_APPLICATION_MUTATION, {
      input: { company: 'Private Co', role: 'Engineer' },
    });
    const createBody = createRes.json() as GraphQLResponse<{ createApplication: { id: string } }>;
    const appId = createBody.data!.createApplication.id;

    const getRes = await authedInject(otherToken, APPLICATION_QUERY, { id: appId });
    const getBody = getRes.json() as GraphQLResponse<{ application: null }>;
    expect(getBody.data).toEqual({ application: null });
    expect(getBody.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
  });
  it('restores a selection from Trash in one call', async () => {
    const token = await registerAndLogin();
    const ids: string[] = [];
    for (const company of ['Acme', 'Globex', 'Initech']) {
      const created = await authedInject(token, CREATE_APPLICATION_MUTATION, {
        input: { company, role: 'Engineer', status: 'applied' },
      });
      ids.push(
        (created.json() as GraphQLResponse<{ createApplication: { id: string } }>).data!
          .createApplication.id,
      );
    }
    for (const id of ids) await authedInject(token, DELETE_APPLICATION_MUTATION, { id });

    const restored = await authedInject(token, BULK_RESTORE_MUTATION, { ids: [ids[0], ids[1]] });
    expect(
      (restored.json() as GraphQLResponse<{ bulkRestoreApplications: { restored: number } }>).data!
        .bulkRestoreApplications,
    ).toEqual({ restored: 2 });

    const listed = await authedInject(token, APPLICATIONS_QUERY);
    const live = (
      listed.json() as GraphQLResponse<{ applications: Array<{ id: string }> }>
    ).data!.applications.map((a) => a.id);
    expect(live).toEqual(expect.arrayContaining([ids[0], ids[1]]));
    expect(live).not.toContain(ids[2]);

    // The one left behind is still in Trash, so a partial selection stays partial.
    const trash = await authedInject(token, TRASHED_QUERY);
    expect(
      (
        trash.json() as GraphQLResponse<{ trashedApplications: Array<{ id: string }> }>
      ).data!.trashedApplications.map((a) => a.id),
    ).toEqual([ids[2]]);
  });

  it("refuses a bulk restore containing someone else's application", async () => {
    const owner = await registerAndLogin();
    const created = await authedInject(owner, CREATE_APPLICATION_MUTATION, {
      input: { company: 'Private', role: 'Engineer', status: 'applied' },
    });
    const theirs = (created.json() as GraphQLResponse<{ createApplication: { id: string } }>).data!
      .createApplication.id;
    await authedInject(owner, DELETE_APPLICATION_MUTATION, { id: theirs });

    const attacker = await registerAndLogin();
    const mine = await authedInject(attacker, CREATE_APPLICATION_MUTATION, {
      input: { company: 'Mine', role: 'Engineer', status: 'applied' },
    });
    const mineId = (mine.json() as GraphQLResponse<{ createApplication: { id: string } }>).data!
      .createApplication.id;
    await authedInject(attacker, DELETE_APPLICATION_MUTATION, { id: mineId });

    // Mixing one of their ids into an otherwise valid batch must not be a way
    // to have it quietly skipped — the whole call fails.
    const res = await authedInject(attacker, BULK_RESTORE_MUTATION, { ids: [mineId, theirs] });
    expect((res.json() as GraphQLResponse<unknown>).errors?.[0]?.extensions?.code).toBe(
      'FORBIDDEN',
    );

    const stillTrashed = await authedInject(owner, TRASHED_QUERY);
    expect(
      (
        stillTrashed.json() as GraphQLResponse<{ trashedApplications: Array<{ id: string }> }>
      ).data!.trashedApplications.map((a) => a.id),
    ).toEqual([theirs]);
  });

  it('empties the whole Trash and reports the counts', async () => {
    const token = await registerAndLogin();
    const ids: string[] = [];
    for (const company of ['Acme', 'Globex']) {
      const created = await authedInject(token, CREATE_APPLICATION_MUTATION, {
        input: { company, role: 'Engineer', status: 'applied' },
      });
      ids.push(
        (created.json() as GraphQLResponse<{ createApplication: { id: string } }>).data!
          .createApplication.id,
      );
    }
    for (const id of ids) await authedInject(token, DELETE_APPLICATION_MUTATION, { id });

    const emptied = await authedInject(token, EMPTY_TRASH_MUTATION);
    expect(
      (emptied.json() as GraphQLResponse<{ emptyTrash: { deleted: number; failed: number } }>).data!
        .emptyTrash,
    ).toEqual({ deleted: 2, failed: 0 });

    const trash = await authedInject(token, TRASHED_QUERY);
    expect(
      (trash.json() as GraphQLResponse<{ trashedApplications: unknown[] }>).data!
        .trashedApplications,
    ).toEqual([]);

    // Really gone, not merely hidden again.
    const gone = await authedInject(token, APPLICATION_QUERY, { id: ids[0] });
    expect((gone.json() as GraphQLResponse<unknown>).errors?.[0]?.extensions?.code).toBe(
      'NOT_FOUND',
    );
  });

  it("empties only the caller's Trash", async () => {
    const owner = await registerAndLogin();
    const created = await authedInject(owner, CREATE_APPLICATION_MUTATION, {
      input: { company: 'Private', role: 'Engineer', status: 'applied' },
    });
    const theirs = (created.json() as GraphQLResponse<{ createApplication: { id: string } }>).data!
      .createApplication.id;
    await authedInject(owner, DELETE_APPLICATION_MUTATION, { id: theirs });

    const other = await registerAndLogin();
    const emptied = await authedInject(other, EMPTY_TRASH_MUTATION);
    expect(
      (emptied.json() as GraphQLResponse<{ emptyTrash: { deleted: number } }>).data!.emptyTrash,
    ).toEqual({ deleted: 0, failed: 0 });

    const stillThere = await authedInject(owner, TRASHED_QUERY);
    expect(
      (
        stillThere.json() as GraphQLResponse<{ trashedApplications: Array<{ id: string }> }>
      ).data!.trashedApplications.map((a) => a.id),
    ).toEqual([theirs]);
  });
  it('serves section counts alongside the application, zeros included', async () => {
    const token = await registerAndLogin();
    const created = await authedInject(token, CREATE_APPLICATION_MUTATION, {
      input: { company: 'Acme', role: 'Engineer', status: 'applied' },
    });
    const app = (created.json() as GraphQLResponse<{ createApplication: { id: string } }>).data!
      .createApplication;

    const res = await authedInject(
      token,
      `query AppCounts($id: ID!) {
        application(id: $id) {
          id
          sectionCounts { notes interviews contacts documents documentDrafts offers }
        }
      }`,
      { id: app.id },
    );
    const body = res.json() as GraphQLResponse<{
      application: { sectionCounts: Record<string, number> };
    }>;

    expect(body.errors).toBeUndefined();
    // Every section reports a number even when empty — the index dims a zero
    // rather than hiding the row, so an absent key would be indistinguishable
    // from "not loaded".
    expect(body.data!.application.sectionCounts).toEqual({
      notes: 0,
      interviews: 0,
      contacts: 0,
      documents: 0,
      documentDrafts: 0,
      offers: 0,
    });
  });

  it('counts what the application actually holds', async () => {
    const token = await registerAndLogin();
    const created = await authedInject(token, CREATE_APPLICATION_MUTATION, {
      input: { company: 'Acme', role: 'Engineer', status: 'applied' },
    });
    const appId = (created.json() as GraphQLResponse<{ createApplication: { id: string } }>).data!
      .createApplication.id;

    for (const content of ['first', 'second']) {
      await authedInject(
        token,
        `mutation CreateNote($applicationId: ID!, $content: String!) {
          createNote(applicationId: $applicationId, content: $content) { id }
        }`,
        { applicationId: appId, content },
      );
    }

    const res = await authedInject(
      token,
      `query AppCounts($id: ID!) {
        application(id: $id) { sectionCounts { notes offers } }
      }`,
      { id: appId },
    );
    const counts = (
      res.json() as GraphQLResponse<{ application: { sectionCounts: Record<string, number> } }>
    ).data!.application.sectionCounts;

    expect(counts.notes).toBe(2);
    expect(counts.offers).toBe(0);
  });

  it("does not serve another user's section counts", async () => {
    const owner = await registerAndLogin();
    const created = await authedInject(owner, CREATE_APPLICATION_MUTATION, {
      input: { company: 'Private', role: 'Engineer', status: 'applied' },
    });
    const appId = (created.json() as GraphQLResponse<{ createApplication: { id: string } }>).data!
      .createApplication.id;

    const attacker = await registerAndLogin();
    const res = await authedInject(
      attacker,
      `query AppCounts($id: ID!) { application(id: $id) { sectionCounts { notes } } }`,
      { id: appId },
    );

    expect((res.json() as GraphQLResponse<unknown>).errors?.[0]?.extensions?.code).toBe(
      'FORBIDDEN',
    );
  });
});
