import { TOOL_CATALOGUE } from '#src/interface-adapters/llm/toolCatalogue.js';
import type { ScriptedCall } from '#src/evals/chatScript.js';

/** Shorthand for scripting a chat trace, shared by the chat case files. */
export const WRITE_TOOLS = TOOL_CATALOGUE.filter((tool) => tool.access === 'write').map(
  (tool) => tool.name,
);

export const call = (name: string, args: Record<string, unknown> = {}): ScriptedCall => ({
  name,
  arguments: args,
});
export const lookup = (...calls: ScriptedCall[]) => ({ calls });
export const answer = (text: string) => ({ text });

export const listApplications = call('list_applications');
