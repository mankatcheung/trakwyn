import { describe, it, expect, vi } from 'vitest';
import { ChatWriteTools } from '#src/interface-adapters/llm/ChatWriteTools.js';
import { CHAT_WRITE_TOOLS, TOOL_CATALOGUE } from '#src/interface-adapters/llm/toolCatalogue.js';
import { summarizeChatWrite } from '#src/interface-adapters/llm/chatWriteSummary.js';
import { validateToolArgs } from '#src/interface-adapters/llm/validateToolArgs.js';
import { makeApplication } from '#src/__tests__/helpers/mocks/jobs.js';

const acme = makeApplication({ id: 'app-1', userId: 'user-1', company: 'Acme', role: 'Engineer' });

function build() {
  const deps = {
    applicationRepository: { findById: vi.fn().mockResolvedValue(acme) },
    noteRepository: { findById: vi.fn().mockResolvedValue(null) },
    contactRepository: { findById: vi.fn().mockResolvedValue(null) },
    interviewRoundRepository: { findById: vi.fn().mockResolvedValue(null) },
    offerRepository: { findById: vi.fn().mockResolvedValue(null) },
    skillRepository: { findById: vi.fn().mockResolvedValue(null) },
    educationRepository: { findById: vi.fn().mockResolvedValue(null) },
    workExperienceRepository: { findById: vi.fn().mockResolvedValue(null) },
    updateApplicationUseCase: { execute: vi.fn().mockResolvedValue({ id: 'app-1' }) },
    createOfferUseCase: { execute: vi.fn() },
  };
  return { deps, tools: new ChatWriteTools(deps as never) };
}

describe('ChatWriteTools', () => {
  describe('which tools chat can propose', () => {
    it('is every non-destructive write and no delete', () => {
      const { tools } = build();
      const writes = TOOL_CATALOGUE.filter((t) => t.access === 'write');

      for (const tool of writes) {
        expect(tools.has(tool.name)).toBe(!('destructive' in tool && tool.destructive));
      }
      expect(tools.has('trash_application')).toBe(false);
      expect(tools.has('list_applications')).toBe(false);
      expect(tools.has('toString')).toBe(false);
      expect(CHAT_WRITE_TOOLS.map((t) => t.name)).not.toContain('trash_application');
    });
  });

  describe('prepare', () => {
    it('keeps only declared arguments and describes the change', async () => {
      const { tools } = build();

      const prepared = await tools.prepare(
        'update_application',
        { applicationId: 'app-1', status: 'interviewing', injected: 'x' },
        'user-1',
      );

      expect(prepared.args).toEqual({ applicationId: 'app-1', status: 'interviewing' });
      expect(prepared.summary).toBe('Move Acme / Engineer to interviewing');
    });

    it("refuses another user's application when proposed, not when confirmed", async () => {
      const { tools, deps } = build();
      deps.applicationRepository.findById.mockResolvedValue({ ...acme, userId: 'someone-else' });

      const err = await tools
        .prepare('update_application', { applicationId: 'app-1', status: 'applied' }, 'user-1')
        .catch((e) => e);

      expect(err.code).toBe('NOT_FOUND');
    });

    it('refuses a record that does not exist', async () => {
      const { tools, deps } = build();
      deps.applicationRepository.findById.mockResolvedValue(null);

      const err = await tools
        .prepare('create_note', { applicationId: 'gone', content: 'hi' }, 'user-1')
        .catch((e) => e);

      expect(err.code).toBe('NOT_FOUND');
    });

    it("reaches an application through a note and refuses a note on someone else's", async () => {
      const { tools, deps } = build();
      deps.noteRepository.findById.mockResolvedValue({ id: 'n1', applicationId: 'app-1' });
      deps.applicationRepository.findById.mockResolvedValue({ ...acme, userId: 'other' });

      const err = await tools
        .prepare('update_note', { noteId: 'n1', content: 'new' }, 'user-1')
        .catch((e) => e);

      expect(err.code).toBe('NOT_FOUND');
    });

    it("refuses another user's skill", async () => {
      const { tools, deps } = build();
      deps.skillRepository.findById.mockResolvedValue({ id: 's1', userId: 'other', name: 'Go' });

      const err = await tools
        .prepare('update_skill', { skillId: 's1', name: 'Rust' }, 'user-1')
        .catch((e) => e);

      expect(err.code).toBe('NOT_FOUND');
    });

    it('refuses a bad status, a missing required field and a wrong type', async () => {
      const { tools } = build();

      const status = await tools
        .prepare('update_application', { applicationId: 'app-1', status: 'hired' }, 'user-1')
        .catch((e) => e);
      const required = await tools
        .prepare('create_application', { company: 'A' }, 'user-1')
        .catch((e) => e);
      const type = await tools
        .prepare('create_offer', { applicationId: 'app-1', baseSalary: 'lots' }, 'user-1')
        .catch((e) => e);

      expect([status.code, required.code, type.code]).toEqual([
        'VALIDATION',
        'VALIDATION',
        'VALIDATION',
      ]);
    });

    it('never calls a use case', async () => {
      const { tools, deps } = build();

      await tools.prepare(
        'update_application',
        { applicationId: 'app-1', status: 'applied' },
        'user-1',
      );

      expect(deps.updateApplicationUseCase.execute).not.toHaveBeenCalled();
    });
  });

  describe('apply', () => {
    it('runs the saved arguments through the shared handler for the user', async () => {
      const { tools, deps } = build();

      const result = await tools.apply(
        'update_application',
        { applicationId: 'app-1', status: 'interviewing' },
        'user-1',
      );

      expect(deps.updateApplicationUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          applicationId: 'app-1',
          status: 'interviewing',
        }),
      );
      expect(result).toEqual({ id: 'app-1' });
    });

    it('lets a use case refusal through, e.g. PLAN_REQUIRED on create_offer', async () => {
      const { tools, deps } = build();
      const refusal = Object.assign(new Error('Pro only'), { code: 'PLAN_REQUIRED' });
      deps.createOfferUseCase.execute.mockRejectedValue(refusal);

      await expect(
        tools.apply('create_offer', { applicationId: 'app-1', baseSalary: 100 }, 'user-1'),
      ).rejects.toBe(refusal);
    });

    it('refuses arguments the handler rejects and a tool chat does not offer', async () => {
      const { tools } = build();

      const invalid = await tools.apply('update_application', {}, 'user-1').catch((e) => e);
      const delete_ = await tools
        .apply('trash_application', { applicationId: 'a' }, 'user-1')
        .catch((e) => e);

      expect((invalid as { code: string }).code).toBe('VALIDATION');
      expect((delete_ as { code: string }).code).toBe('VALIDATION');
    });
  });
});

describe('summarizeChatWrite', () => {
  it('states every write tool in words, so the card can never be blank', () => {
    for (const tool of CHAT_WRITE_TOOLS) {
      const summary = summarizeChatWrite(
        tool.name,
        {
          company: 'Acme',
          role: 'Engineer',
          name: 'Rust',
          title: 'Dev',
          institution: 'MIT',
          baseSalary: 1,
          content: 'hi',
          question: 'Why?',
        },
        { application: 'Acme / Engineer', record: 'Rust', roundType: 'phone' },
      );
      expect(summary.length).toBeGreaterThan(8);
      expect(summary).not.toContain('undefined');
    }
  });

  it('clips long note text', () => {
    const summary = summarizeChatWrite('create_note', { content: 'x'.repeat(500) }, {});

    expect(summary.length).toBeLessThan(120);
  });
});

describe('validateToolArgs', () => {
  const schema = {
    properties: {
      a: { type: 'string' },
      n: { type: 'number' },
      e: { type: 'string', enum: ['x', 'y'] },
      d: { type: 'string', description: 'ISO 8601 date' },
    },
    required: ['a'],
  } as const;

  it('accepts numeric strings and drops nulls and unknown keys', () => {
    expect(validateToolArgs(schema, { a: 'v', n: '5', e: null, zzz: 1 })).toEqual({
      a: 'v',
      n: '5',
    });
  });

  it.each([
    [{}, 'a is required'],
    [{ a: 1 }, 'a must be a string'],
    [{ a: 'v', n: true }, 'n must be a number'],
    [{ a: 'v', n: '' }, 'n must be a number'],
    [{ a: 'v', e: 'z' }, 'e must be one of: x, y'],
    [{ a: 'v', d: 'tomorrow-ish' }, 'd must be an ISO 8601 date'],
  ])('rejects %j', (args, message) => {
    expect(() => validateToolArgs(schema, args)).toThrow(message);
  });
});
