import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';
import { ENV, LLM_PROVIDER_MODE } from '#src/infrastructure/config/constants.js';
import { MOCK_INTERVIEW_PROMPT_TASK } from '#src/use-cases/constants.js';

describe('fake LLM completions route — LLM_PROVIDER_MODE=fake', () => {
  let testApp: TestApp;
  const originalMode = process.env[ENV.LLM_PROVIDER_MODE];

  beforeAll(async () => {
    process.env[ENV.LLM_PROVIDER_MODE] = LLM_PROVIDER_MODE.FAKE;
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    if (originalMode === undefined) delete process.env[ENV.LLM_PROVIDER_MODE];
    else process.env[ENV.LLM_PROVIDER_MODE] = originalMode;
    await testApp.cleanup();
  });

  it('replies with an SSE-framed stream when the request carries tools (chat, JEF-239)', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/llm-test/fake/chat/completions',
      payload: {
        model: 'fake-model',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
        tools: [{ type: 'function', function: { name: 'list_applications' } }],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.body).toContain('Fake assistant reply for e2e testing.');
    expect(res.body.trim().endsWith('data: [DONE]')).toBe(true);
  });

  it('replies with practice questions for the practice question prompt (JEF-393)', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/llm-test/fake/chat/completions',
      payload: {
        model: 'fake-model',
        messages: [
          { role: 'system', content: `You are a coach. ${MOCK_INTERVIEW_PROMPT_TASK.QUESTIONS}.` },
          { role: 'user', content: 'Write 3 practice questions' },
        ],
      },
    });

    const content = JSON.parse(res.json().choices[0].message.content);
    expect(content.questions).toHaveLength(3);
  });

  it('replies with a plain-text answer for the practice answer prompt (JEF-393)', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/llm-test/fake/chat/completions',
      payload: {
        model: 'fake-model',
        messages: [
          { role: 'system', content: `You are a coach. ${MOCK_INTERVIEW_PROMPT_TASK.ANSWER}.` },
          { role: 'user', content: 'Interview question: why us?' },
        ],
      },
    });

    const content: string = res.json().choices[0].message.content;
    expect(content.length).toBeGreaterThan(10);
    expect(() => JSON.parse(content)).toThrow();
  });

  it('replies with the canned resume JSON when the request carries no tools (complete)', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/llm-test/fake/chat/completions',
      payload: {
        model: 'fake-model',
        messages: [{ role: 'user', content: 'tailor this resume' }],
        max_tokens: 2048,
      },
    });

    expect(res.statusCode).toBe(200);
    const content = JSON.parse(res.json().choices[0].message.content);
    expect(content.experience[0]).toMatchObject({ company: 'Acme Corp', title: 'Senior Engineer' });
    expect(content.education[0]).toMatchObject({ institution: 'State University' });
  });
});
