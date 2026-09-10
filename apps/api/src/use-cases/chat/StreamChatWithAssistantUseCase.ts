import {
  AiNotConfiguredError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import type { ILLMProviderFactory } from '#src/use-cases/ports/ILLMProviderFactory.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { IMessageRepository } from '#src/use-cases/ports/IMessageRepository.js';
import type { IConversationRepository } from '#src/use-cases/ports/IConversationRepository.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { LLMToolCall, LLMToolDefinition } from '#src/use-cases/ports/ILLMProvider.js';
import { CHAT } from '#src/use-cases/constants.js';
import {
  type ChatToolDeps,
  buildChatMessages,
  deriveChatTitle,
  executeChatTool,
  formatToolResultForModel,
  summarizeToolResult,
  trimHistoryToBudget,
} from '#src/use-cases/chat/chatAssembly.js';

export interface ChatWithAssistantInput {
  userId: string;
  conversationId: string;
  message: string;
  /**
   * Aborted when the client disconnects before a reply arrives (JEF-240) —
   * threaded down to the LLM provider fetch so a cancelled generation stops
   * costing tokens server-side instead of running to completion for no one.
   * Tool execution itself isn't cancelled (cheap DB reads, not the expense
   * this exists to avoid) — only the LLM call.
   */
  signal?: AbortSignal;
}

export interface ChatWithAssistantDeps extends ChatToolDeps {
  /**
   * The tools this surface offers the model, injected rather than imported:
   * the catalogue is an adapter-layer contract, and which subset chat gets
   * is a composition decision (see `http/di`) — chat is session-authenticated
   * with no token scope, so it receives read tools only (JEF-177).
   */
  chatTools: LLMToolDefinition[];
  llmProviderFactory: ILLMProviderFactory;
  chatRateLimiter: IRateLimiter;
  messageRepository: IMessageRepository;
  conversationRepository: IConversationRepository;
  userRepository: IUserRepository;
  generateId: () => string;
}

/**
 * `delta` carries incremental assistant text as it arrives — including
 * narration ahead of a tool call, since real streaming naturally surfaces
 * that. `done` always terminates the stream. Only text from the *final*
 * round (the one with no further tool calls) is persisted as the assistant
 * message — mid-conversation narration is real-time UI only, discarded on
 * reload.
 */
export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  /**
   * The key this turn would have used was paused at its monthly limit, and
   * the user's opt-in fallback picked another one (JEF-258). Emitted before
   * any text, so the client can say which key answered.
   */
  | { type: 'fallback'; from: string; to: string }
  | { type: 'done' };

/**
 * Streams the assistant's reply token-by-token (JEF-239): rate limiting,
 * conversation/user lookup, message assembly, tool-calling loop, and
 * persistence, yielding text as the provider streams it rather than
 * returning a fully-assembled `Promise<string>`. The shared parts (message
 * assembly, tool dispatch, title derivation) live in `chatAssembly.ts`.
 */
export class StreamChatWithAssistantUseCase {
  constructor(private readonly deps: ChatWithAssistantDeps) {}

  async *execute(input: ChatWithAssistantInput): AsyncGenerator<ChatStreamEvent> {
    // Before the rate limiter: a request that was never going to run should
    // not spend one of the user's attempts.
    if (input.message.trim().length === 0) {
      throw new ValidationError('Message is required');
    }
    if (input.message.length > CHAT.MAX_MESSAGE_CHARS) {
      throw new ValidationError(
        `Message is too long — keep it under ${CHAT.MAX_MESSAGE_CHARS.toLocaleString()} characters`,
      );
    }

    if (!(await this.deps.chatRateLimiter.consume(`chat:${input.userId}`))) {
      throw new RateLimitedError('Too many messages — please wait a moment and try again');
    }

    const conversation = await this.deps.conversationRepository.findById(input.conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }
    if (conversation.userId !== input.userId) {
      throw new ForbiddenError('Forbidden');
    }

    const user = await this.deps.userRepository.findById(input.userId);
    const history = await this.deps.messageRepository.findAllByConversationId(input.conversationId);
    // Only the most recent CHAT.MAX_HISTORY_MESSAGES go to the model — see
    // that constant's doc comment (JEF-237). `history` itself stays the full,
    // uncapped list: `history.length === 0` below needs to know whether this
    // is truly the conversation's first message, not just the first one
    // still within the cap.
    const historyForPrompt = trimHistoryToBudget(
      history.slice(-CHAT.MAX_HISTORY_MESSAGES),
      CHAT.MAX_HISTORY_CHARS,
    );
    const messages = buildChatMessages(historyForPrompt, input.message, user);

    const providerName = conversation.llmProvider ?? user?.defaultLlmProvider ?? null;
    const resolution = await this.deps.llmProviderFactory.resolveForUser(
      input.userId,
      providerName ?? undefined,
      conversation.llmModel,
    );
    const llmProvider = resolution?.provider ?? null;
    if (resolution?.fellBackFrom) {
      yield { type: 'fallback', from: resolution.fellBackFrom, to: resolution.providerId };
    }
    if (!llmProvider) {
      throw new AiNotConfiguredError('Add your AI API key in Settings to use this feature');
    }
    if (!conversation.llmProvider && providerName) {
      await this.deps.conversationRepository.updateLlmSettings(
        conversation.id,
        providerName,
        conversation.llmModel,
      );
    }

    let finalReply =
      'That took more steps than I could complete — try asking something more specific.';
    const toolTrace: string[] = [];

    for (let i = 0; i < CHAT.MAX_TOOL_ITERATIONS; i++) {
      let content = '';
      let toolCalls: LLMToolCall[] = [];

      for await (const event of llmProvider.completeWithToolsStream(
        messages,
        this.deps.chatTools,
        undefined,
        input.signal,
      )) {
        if (event.type === 'text_delta') {
          yield { type: 'delta', text: event.text };
        } else if (event.type === 'done') {
          content = event.content ?? '';
          toolCalls = event.toolCalls;
        }
        // `prompt_usage` is the usage tracker's business, not the chat's.
      }

      if (toolCalls.length === 0) {
        finalReply = content.trim() || "I don't have a response for that.";
        break;
      }

      messages.push({ role: 'assistant', content, toolCalls });
      const toolResults = await Promise.all(
        toolCalls.map((call) => executeChatTool(call, input.userId, this.deps)),
      );
      toolCalls.forEach((call, idx) => {
        toolTrace.push(summarizeToolResult(call, toolResults[idx]));
        messages.push({
          role: 'tool',
          content: formatToolResultForModel(call.name, toolResults[idx]),
          toolCallId: call.id,
        });
      });
      // Breakpoint 3 moves each iteration: everything up to and including
      // this round's tool results is a cache hit on the next call of the
      // loop, instead of the whole prompt being re-billed per iteration.
      // Anthropic allows four markers; the two from buildChatMessages plus
      // this one leave one spare. Providers without explicit caching ignore
      // the flag (T2).
      for (const m of messages) if (m.role === 'tool') m.cacheBreakpoint = false;
      messages[messages.length - 1].cacheBreakpoint = true;
    }

    await this.deps.messageRepository.create({
      id: this.deps.generateId(),
      conversationId: input.conversationId,
      role: 'user',
      content: input.message,
    });
    await this.deps.messageRepository.create({
      id: this.deps.generateId(),
      conversationId: input.conversationId,
      role: 'assistant',
      content: finalReply,
      toolTrace: toolTrace.length ? toolTrace.join('; ') : null,
    });

    if (history.length === 0) {
      await this.deps.conversationRepository.updateTitle(
        input.conversationId,
        deriveChatTitle(input.message),
      );
    }

    yield { type: 'done' };
  }
}
