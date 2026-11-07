import { runChatTurn } from '#src/evals/chatHarness.js';
import { finalTextOf, type ChatScript } from '#src/evals/chatScript.js';
import {
  calledNoTools,
  calledTool,
  callOrder,
  didNotCallTool,
  failuresOf,
  isPresent,
  withinIterationCap,
  type Check,
} from '#src/evals/cases/matchers.js';
import { CHAT_TOOLS } from '#src/interface-adapters/llm/toolCatalogue.js';
import { CHAT } from '#src/use-cases/constants.js';
import type { ChatEvalCase } from '#src/evals/types.js';

const OFFERED_TOOLS = new Set<string>(CHAT_TOOLS.map((tool) => tool.name));

/** A tool the case needs: any one of `anyOf`, carrying the named arguments. */
export interface ExpectedToolCall {
  anyOf: string[];
  args?: Record<string, string>;
}

export interface ChatCaseSpec {
  id: string;
  message: string;
  /** Tools that must be called. Each takes the first acceptable alternative the model used. */
  expectToolCalls?: ExpectedToolCall[];
  /** Tools that must be called in this order, by name. */
  callOrder?: string[];
  /**
   * The first call must be one of these: a reference like "my Stripe application"
   * has to be resolved to an id before anything is asked about it.
   */
  firstCall?: string[];
  /** Tools that must not be called at all. */
  forbidToolCalls?: string[];
  /** The question needs no lookup: any tool call fails the case. */
  noTools?: boolean;
  /** Checks on the final answer: values from the fake data it must use, ones it must not state. */
  expectAnswer?: (answer: string) => Check[];
  /** What a good model does. The tests feed it to this case's own checks. */
  idealTrace: ChatScript;
  /** Wrong behaviour the checks must catch (following an injection, a needless tool call). */
  badTraces?: ChatScript[];
}

/**
 * One scripted question through the real chat use case, graded on which tools
 * the model chose and what it said (JEF-471). Tone and helpfulness are not
 * judged. The checks that apply to every turn are here: the loop must end on
 * an answer, inside the iteration cap, and only offered tools may be named.
 */
export function chatCase(spec: ChatCaseSpec): ChatEvalCase {
  return {
    id: spec.id,
    feature: 'chat',
    idealReply: finalTextOf(spec.idealTrace),
    idealTrace: spec.idealTrace,
    badTraces: spec.badTraces ?? [],
    run: async (provider) => {
      const trace = await runChatTurn(provider, spec.message);
      const unknown = trace.calls
        .map((call) => call.name)
        .filter((name) => !OFFERED_TOOLS.has(name));

      return failuresOf(
        withinIterationCap(trace.rounds, trace.capped, CHAT.MAX_TOOL_ITERATIONS),
        unknown.length === 0 ? null : `called tools that are not offered: ${unknown.join(', ')}`,
        isPresent('answer', trace.answer),
        spec.noTools ? calledNoTools(trace.calls) : null,
        ...(spec.expectToolCalls ?? []).map((tool) =>
          calledTool(trace.calls, tool.anyOf, tool.args),
        ),
        spec.callOrder ? callOrder(trace.calls, ...spec.callOrder) : null,
        spec.firstCall && trace.calls.length > 0
          ? calledTool(trace.calls.slice(0, 1), spec.firstCall) &&
              `the first call must be ${spec.firstCall.join(' or ')}, not ${trace.calls[0]?.name}`
          : null,
        spec.forbidToolCalls ? didNotCallTool(trace.calls, ...spec.forbidToolCalls) : null,
        ...(spec.expectAnswer?.(trace.answer) ?? []),
      );
    },
  };
}
