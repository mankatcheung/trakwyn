import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHAT_TOOLS,
  MCP_TOOLS,
  TOOL_CATALOGUE,
  toLlmToolDefinitions,
} from '#src/interface-adapters/llm/toolCatalogue.js';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}

describe('tool catalogue (JEF-177)', () => {
  it('is never imported by a use case — the catalogue is an adapter concern', () => {
    // ChatWithAssistantUseCase used to import this list directly, which was
    // the only place in use-cases/ reaching up into the adapter layer. It now
    // receives its tools as an injected LLMToolDefinition[] instead. This
    // guards the direction generally, so a future slip is caught too.
    const useCasesDir = join(import.meta.dirname, '../../../use-cases');
    const offenders = walk(useCasesDir).filter((file) =>
      readFileSync(file, 'utf8').includes("from '#src/interface-adapters"),
    );

    expect(offenders).toEqual([]);
  });

  it('gives each surface its own selection rather than one shared list', () => {
    // MCP exposes everything and gates writes per request by token scope.
    expect(MCP_TOOLS).toEqual(TOOL_CATALOGUE);
    // Chat is session-authenticated with no scope to gate on, so its writes
    // are proposals the user confirms (JEF-469) and it gets no delete.
    expect(CHAT_TOOLS.filter((t) => t.access === 'read')).toEqual(
      TOOL_CATALOGUE.filter((t) => t.access === 'read'),
    );
    expect(CHAT_TOOLS.some((t) => 'destructive' in t && t.destructive)).toBe(false);
    expect(CHAT_TOOLS.length).toBeLessThan(MCP_TOOLS.length);
  });

  it('drops the internal access tag when adapting for an LLM provider', () => {
    const defs = toLlmToolDefinitions(CHAT_TOOLS);
    expect(defs.every((d) => !('access' in d))).toBe(true);
    expect(defs).toHaveLength(CHAT_TOOLS.length);
  });

  it('marks only the last adapted tool as a cache breakpoint', () => {
    const defs = toLlmToolDefinitions(CHAT_TOOLS);
    expect(defs.filter((d) => d.cacheBreakpoint)).toHaveLength(1);
    expect(defs[defs.length - 1].cacheBreakpoint).toBe(true);
  });

  it('does not restate the scope requirement in write-tool descriptions (JEF-178)', () => {
    // Neither audience can act on it: a read-only token never sees write
    // tools (tools/list filters them out) and a full-access token can call
    // them anyway. Ten repetitions cost 330 bytes of the model's context to
    // inform nobody.
    const offenders = TOOL_CATALOGUE.filter((t) => /full[- ]access token/i.test(t.description)).map(
      (t) => t.name,
    );

    expect(offenders).toEqual([]);
  });

  it('has a unique name per tool', () => {
    const names = TOOL_CATALOGUE.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('tags every tool with an access level, since scope gating depends on it', () => {
    // A tool with no access tag would fall through the write check in
    // McpController and be callable with a read-only token.
    expect(TOOL_CATALOGUE.every((t) => t.access === 'read' || t.access === 'write')).toBe(true);
  });
});
