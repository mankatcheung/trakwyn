import type { ILLMProvider, LLMStreamEvent } from '#src/use-cases/ports/ILLMProvider.js';

/** One tool call a scripted model makes. */
export interface ScriptedCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** One model reply: some text, and the tools it asks for. No tools ends the turn. */
export interface ScriptedRound {
  text?: string;
  calls?: ScriptedCall[];
}

/** What a model does across a turn, round by round. */
export interface ChatScript {
  rounds: ScriptedRound[];
}

/** The text a script ends on: its last round's. */
export function finalTextOf(script: ChatScript): string {
  return script.rounds[script.rounds.length - 1]?.text ?? '';
}

/**
 * A model that follows `script` instead of thinking (JEF-471). The tests give
 * each case its ideal script to prove the case can pass, and a wrong one
 * (never calls a tool, follows an injection) to prove it can fail. A model
 * asked for more rounds than the script has just stops.
 */
export function scriptedChatProvider(script: ChatScript): ILLMProvider {
  let round = 0;
  return {
    complete: async () => ({ content: '', usage: null }),
    async *completeWithToolsStream(): AsyncGenerator<LLMStreamEvent> {
      const step = script.rounds[round] ?? { text: 'The script ended.' };
      const index = round;
      round += 1;
      if (step.text) yield { type: 'text_delta', text: step.text };
      yield {
        type: 'done',
        content: step.text ?? '',
        toolCalls: (step.calls ?? []).map((call, i) => ({
          id: `call-${index}-${i}`,
          name: call.name,
          arguments: call.arguments,
        })),
        usage: null,
      };
    },
  };
}
