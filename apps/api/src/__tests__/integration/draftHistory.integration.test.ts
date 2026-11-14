import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';
import { DRAFT_HISTORY } from '#src/use-cases/constants.js';

const REGISTER = `mutation Register($email: String!, $password: String!) { register(email: $email, password: $password) }`;
const CREATE_APP = `mutation($input: CreateApplicationInput!) { createApplication(input: $input) { id } }`;
const CREATE_DRAFT = `mutation($input: CreateDocumentDraftInput!) { createDocumentDraft(input: $input) { id } }`;
const UPDATE = `mutation($input: UpdateDocumentDraftContentInput!) { updateDocumentDraftContent(input: $input) { id contentJson plainText } }`;
const VERSIONS = `query($draftId: ID!) { documentDraftVersions(draftId: $draftId) { id source characterCount createdAt } }`;
const VERSION = `query($id: ID!) { documentDraftVersion(id: $id) { id plainText contentJson source } }`;
const SAVE_VERSION = `mutation($draftId: ID!) { createDocumentDraftVersion(draftId: $draftId) { id source } }`;
const RESTORE = `mutation($versionId: ID!) { restoreDocumentDraftVersion(versionId: $versionId) { id contentJson plainText } }`;
const DELETE_DRAFT = `mutation($id: ID!) { deleteDocumentDraft(id: $id) }`;

interface GqlResponse<T> {
  data: T | null;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

const doc = (text: string) =>
  JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });

describe('draft history integration (JEF-584)', () => {
  let testApp: TestApp;

  const gql = async <T>(token: string | null, query: string, variables?: object) => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: { query, variables },
    });
    return res.json() as GqlResponse<T>;
  };

  const register = async () => {
    const body = await gql<{ register: string }>(null, REGISTER, {
      email: `${randomUUID()}@example.com`,
      password: 'correct-horse-1',
    });
    return body.data!.register;
  };

  const makeDraft = async (token: string, text: string) => {
    const app = await gql<{ createApplication: { id: string } }>(token, CREATE_APP, {
      input: { company: 'Acme', role: 'Eng', status: 'applied' },
    });
    const draft = await gql<{ createDocumentDraft: { id: string } }>(token, CREATE_DRAFT, {
      input: {
        applicationId: app.data!.createApplication.id,
        type: 'resume',
        title: 'CV',
        contentJson: doc(text),
        plainText: text,
      },
    });
    return draft.data!.createDocumentDraft.id;
  };

  const save = (token: string, draftId: string, text: string, replacedByAi = false) =>
    gql(token, UPDATE, {
      input: { draftId, contentJson: doc(text), plainText: text, replacedByAi },
    });

  const versionsOf = async (token: string, draftId: string) =>
    (
      await gql<{
        documentDraftVersions: Array<{ id: string; source: string; characterCount: number }>;
      }>(token, VERSIONS, { draftId })
    ).data!.documentDraftVersions;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });
  afterAll(async () => {
    await testApp.cleanup();
  });

  it('keeps the content an AI replace overwrites, labelled ai, and restores it', async () => {
    const token = await register();
    const draftId = await makeDraft(token, 'My handwritten resume');

    const saved = await save(token, draftId, 'Rewritten by the AI', true);
    expect(saved.errors).toBeUndefined();

    const versions = await versionsOf(token, draftId);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      source: 'ai',
      characterCount: 'My handwritten resume'.length,
    });

    const preview = await gql<{ documentDraftVersion: { plainText: string } }>(token, VERSION, {
      id: versions[0]!.id,
    });
    expect(preview.data!.documentDraftVersion.plainText).toBe('My handwritten resume');

    const restored = await gql<{
      restoreDocumentDraftVersion: { plainText: string; contentJson: string };
    }>(token, RESTORE, { versionId: versions[0]!.id });
    expect(restored.errors).toBeUndefined();
    expect(restored.data!.restoreDocumentDraftVersion.plainText).toBe('My handwritten resume');
    expect(restored.data!.restoreDocumentDraftVersion.contentJson).toBe(
      doc('My handwritten resume'),
    );

    // The restore kept what it replaced, so it can be undone.
    const after = await versionsOf(token, draftId);
    expect(after.map((v) => v.source)).toEqual(['restore', 'ai']);
  });

  it('saves a version by hand, once, and not again until the text changes', async () => {
    const token = await register();
    const draftId = await makeDraft(token, 'First draft');
    const first = await gql<{ createDocumentDraftVersion: { id: string; source: string } }>(
      token,
      SAVE_VERSION,
      { draftId },
    );
    expect(first.data!.createDocumentDraftVersion.source).toBe('manual');
    const again = await gql<{ createDocumentDraftVersion: { id: string } }>(token, SAVE_VERSION, {
      draftId,
    });
    expect(again.data!.createDocumentDraftVersion.id).toBe(
      first.data!.createDocumentDraftVersion.id,
    );
    expect(await versionsOf(token, draftId)).toHaveLength(1);
  });

  it('does not fill the history while typing within the autosave interval', async () => {
    const token = await register();
    const draftId = await makeDraft(token, 'Start');
    await save(token, draftId, 'Start of');
    await save(token, draftId, 'Start of a resume');
    await save(token, draftId, 'Start of a resume that grows');
    // One snapshot of the original, the rest are inside the interval.
    expect(await versionsOf(token, draftId)).toHaveLength(1);
  });

  it('keeps at most the capped number of snapshots, dropping the oldest', async () => {
    const token = await register();
    const draftId = await makeDraft(token, 'v0');
    for (let i = 1; i <= DRAFT_HISTORY.MAX_VERSIONS + 5; i++) {
      await save(token, draftId, `v${i}`, true);
    }
    const versions = await versionsOf(token, draftId);
    expect(versions).toHaveLength(DRAFT_HISTORY.MAX_VERSIONS);
    // The newest snapshot holds the text just before the last save.
    const newest = await gql<{ documentDraftVersion: { plainText: string } }>(token, VERSION, {
      id: versions[0]!.id,
    });
    expect(newest.data!.documentDraftVersion.plainText).toBe(`v${DRAFT_HISTORY.MAX_VERSIONS + 4}`);
  });

  it('shows another user nothing: not the list, not a version, not a restore', async () => {
    const owner = await register();
    const stranger = await register();
    const draftId = await makeDraft(owner, 'Private text');
    await save(owner, draftId, 'Changed', true);
    const [version] = await versionsOf(owner, draftId);

    const list = await gql(stranger, VERSIONS, { draftId });
    expect(list.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
    const get = await gql(stranger, VERSION, { id: version!.id });
    expect(get.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
    expect(JSON.stringify(get)).not.toContain('Private text');
    const restore = await gql(stranger, RESTORE, { versionId: version!.id });
    expect(restore.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
    const saveByStranger = await gql(stranger, SAVE_VERSION, { draftId });
    expect(saveByStranger.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');

    // And the owner's draft is untouched by the attempt.
    expect(await versionsOf(owner, draftId)).toHaveLength(1);
  });

  it('requires a signed-in user', async () => {
    const res = await gql(null, VERSIONS, { draftId: 'x' });
    expect(res.errors?.[0]?.extensions?.code).toBe('UNAUTHORIZED');
  });

  it('removes the history with the draft', async () => {
    const token = await register();
    const draftId = await makeDraft(token, 'Gone soon');
    await save(token, draftId, 'Gone', true);
    const [version] = await versionsOf(token, draftId);
    await gql(token, DELETE_DRAFT, { id: draftId });
    const res = await gql(token, VERSION, { id: version!.id });
    expect(res.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
  });
});
