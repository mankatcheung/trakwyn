import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';
import type { Cradle } from '#src/http/di/types.js';
import { CONTENT_LIMITS, FIELD_LENGTH_LIMITS } from '#src/use-cases/constants.js';

const REGISTER = `mutation R($email: String!, $password: String!) { register(email: $email, password: $password) }`;
const CREATE_APPLICATION = `mutation A($input: CreateApplicationInput!) { createApplication(input: $input) { id } }`;
const UPDATE_APPLICATION = `mutation U($id: ID!, $input: UpdateApplicationInput!) { updateApplication(id: $id, input: $input) { id } }`;
const CREATE_NOTE = `mutation N($applicationId: ID!, $content: String!) { createNote(applicationId: $applicationId, content: $content) { id } }`;
const CREATE_SKILL = `mutation S($input: CreateSkillInput!) { createSkill(input: $input) { id } }`;
const CREATE_CONVERSATION = `mutation C { createConversation { id } }`;
const CONTENT_QUOTA = `
  query Q {
    contentQuota {
      limits {
        notesPerApplication tagsPerApplication skillsPerUser messagesPerConversation
        noteContentMaxLength tagNameMaxLength
      }
      usage { skills conversations apiTokens }
    }
  }
`;

interface GraphQLResponse<T> {
  data: T | null;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

describe('content quotas (JEF-339)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  async function registerAndLogin(): Promise<string> {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query: REGISTER,
        variables: { email: `${randomUUID()}@example.com`, password: 'correct-horse-1' },
      },
    });
    return (res.json() as GraphQLResponse<{ register: string }>).data!.register;
  }

  async function gql<T>(token: string | null, query: string, variables?: Record<string, unknown>) {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: { query, variables },
    });
    return res.json() as GraphQLResponse<T>;
  }

  async function createApplication(token: string): Promise<string> {
    const body = await gql<{ createApplication: { id: string } }>(token, CREATE_APPLICATION, {
      input: { company: 'Acme', role: 'Engineer' },
    });
    return body.data!.createApplication.id;
  }

  it('publishes the limits and the caller’s usage', async () => {
    const token = await registerAndLogin();
    await gql(token, CREATE_SKILL, { input: { name: 'TypeScript' } });
    await gql(token, CREATE_SKILL, { input: { name: 'Go' } });
    await gql(token, CREATE_CONVERSATION);

    const body = await gql<{
      contentQuota: {
        limits: Record<string, number>;
        usage: Record<string, number>;
      };
    }>(token, CONTENT_QUOTA);

    expect(body.errors).toBeUndefined();
    expect(body.data!.contentQuota.limits).toEqual({
      notesPerApplication: CONTENT_LIMITS.NOTES_PER_APPLICATION,
      tagsPerApplication: CONTENT_LIMITS.TAGS_PER_APPLICATION,
      skillsPerUser: CONTENT_LIMITS.SKILLS_PER_USER,
      messagesPerConversation: CONTENT_LIMITS.MESSAGES_PER_CONVERSATION,
      noteContentMaxLength: FIELD_LENGTH_LIMITS.NOTE_CONTENT,
      tagNameMaxLength: FIELD_LENGTH_LIMITS.TAG_NAME,
    });
    expect(body.data!.contentQuota.usage).toEqual({ skills: 2, conversations: 1, apiTokens: 0 });
  });

  it('does not tell an anonymous caller anything', async () => {
    const body = await gql<{ contentQuota: unknown }>(null, CONTENT_QUOTA);

    expect(body.data?.contentQuota ?? null).toBeNull();
    expect(body.errors?.[0]?.extensions?.code).toBe('UNAUTHORIZED');
  });

  it('refuses a note past the per-application cap, and still accepts one on another application', async () => {
    const token = await registerAndLogin();
    const full = await createApplication(token);
    const other = await createApplication(token);

    for (let i = 0; i < CONTENT_LIMITS.NOTES_PER_APPLICATION; i++) {
      const ok = await gql(token, CREATE_NOTE, { applicationId: full, content: `note ${i}` });
      expect(ok.errors).toBeUndefined();
    }

    const refused = await gql(token, CREATE_NOTE, { applicationId: full, content: 'one too many' });
    expect(refused.errors?.[0]?.extensions?.code).toBe('QUOTA_EXCEEDED');
    expect(refused.errors?.[0]?.message).toContain(String(CONTENT_LIMITS.NOTES_PER_APPLICATION));

    const elsewhere = await gql(token, CREATE_NOTE, { applicationId: other, content: 'fine' });
    expect(elsewhere.errors).toBeUndefined();
  }, 60_000);

  it('refuses an over-long note without storing it', async () => {
    const token = await registerAndLogin();
    const applicationId = await createApplication(token);

    const refused = await gql(token, CREATE_NOTE, {
      applicationId,
      content: 'x'.repeat(FIELD_LENGTH_LIMITS.NOTE_CONTENT + 1),
    });

    expect(refused.errors?.[0]?.extensions?.code).toBe('VALIDATION');
  });

  it('refuses too many tags, and a tag name that is too long, on update', async () => {
    const token = await registerAndLogin();
    const id = await createApplication(token);

    const tooMany = await gql(token, UPDATE_APPLICATION, {
      id,
      input: {
        tags: Array.from({ length: CONTENT_LIMITS.TAGS_PER_APPLICATION + 1 }, (_, i) => `t${i}`),
      },
    });
    expect(tooMany.errors?.[0]?.extensions?.code).toBe('QUOTA_EXCEEDED');

    const tooLong = await gql(token, UPDATE_APPLICATION, {
      id,
      input: { tags: ['x'.repeat(FIELD_LENGTH_LIMITS.TAG_NAME + 1)] },
    });
    expect(tooLong.errors?.[0]?.extensions?.code).toBe('VALIDATION');

    const fine = await gql(token, UPDATE_APPLICATION, {
      id,
      input: {
        tags: Array.from({ length: CONTENT_LIMITS.TAGS_PER_APPLICATION }, (_, i) => `t${i}`),
      },
    });
    expect(fine.errors).toBeUndefined();
  });

  it('keeps a conversation to its newest messages through the wired repository', async () => {
    const token = await registerAndLogin();
    const created = await gql<{ createConversation: { id: string } }>(token, CREATE_CONVERSATION);
    const conversationId = created.data!.createConversation.id;
    const { messageRepository } = testApp.app.diContainer.cradle as unknown as Cradle;
    const extra = 3;

    for (let i = 0; i < CONTENT_LIMITS.MESSAGES_PER_CONVERSATION + extra; i++) {
      await messageRepository.create({
        id: `${conversationId}-${String(i).padStart(4, '0')}`,
        conversationId,
        role: 'user',
        content: `message ${i}`,
      });
    }

    const kept = await messageRepository.findAllByConversationId(conversationId);
    expect(kept).toHaveLength(CONTENT_LIMITS.MESSAGES_PER_CONVERSATION);
    expect(kept.map((m) => m.content)).toContain(
      `message ${CONTENT_LIMITS.MESSAGES_PER_CONVERSATION + extra - 1}`,
    );
    expect(kept.map((m) => m.content)).not.toContain('message 0');
  }, 60_000);
});
