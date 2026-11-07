import { NotFoundError, ValidationError } from '#src/use-cases/errors/DomainError.js';
import {
  CHAT_TOOLS,
  CHAT_WRITE_TOOLS,
  toLlmToolDefinitions,
} from '#src/interface-adapters/llm/toolCatalogue.js';
import { StreamChatWithAssistantUseCase } from '#src/use-cases/chat/StreamChatWithAssistantUseCase.js';
import type { ChatToolDeps } from '#src/use-cases/chat/chatAssembly.js';
import { CHAT } from '#src/use-cases/constants.js';
import {
  ANALYTICS,
  APPLICATIONS,
  CHAT_USER_ID,
  CONTACTS,
  INTERVIEW_ROUNDS,
  NOTES,
  OFFERS,
  SKILLS,
  WORK_EXPERIENCES,
} from '#src/evals/fixtures/chatWorld.js';
import type { Application } from '#src/domain/application/Application.js';
import type { Message } from '#src/domain/message/Message.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { IToolCallObserver } from '#src/use-cases/ports/IToolCallObserver.js';

/*
 * Runs the real `StreamChatWithAssistantUseCase` for one message (JEF-471):
 * the real prompt, tool catalogue, `executeChatTool`, result projection and
 * history caps. Only what sits behind the tools is replaced: the use cases
 * and repositories answer from `chatWorld`, and conversations are kept in
 * memory. Chat never applies a write, so a write the model asks for is saved
 * as a proposal here exactly as in production, and nothing in the world changes.
 */

const CONVERSATION_ID = 'chat-eval-conversation';
const WRITE_TOOL_NAMES = new Set<string>(CHAT_WRITE_TOOLS.map((tool) => tool.name));

export interface ChatCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatProposal {
  toolName: string;
  summary: string;
}

/** Everything a case may check about one turn. */
export interface ChatTrace {
  /** Every tool call, in the order the model made them. */
  calls: ChatCall[];
  /** How many times the model was asked (the loop iterations used). */
  rounds: number;
  /** The reply stored for the user. */
  answer: string;
  /** The loop ended because it ran out of rounds, not because the model answered. */
  capped: boolean;
  /** The writes the model asked for, none of which were applied. */
  proposals: ChatProposal[];
}

const unlimited: IRateLimiter = { consume: async () => true, isLimited: async () => false };

const passthroughObserver: IToolCallObserver = {
  observe: (_meta, run) =>
    run({
      succeeded: () => undefined,
      failed: () => undefined,
      invalidParams: () => undefined,
      proposed: () => undefined,
      refused: () => undefined,
      rateLimited: () => undefined,
    }),
};

const forApplication = <T extends { applicationId: string }>(
  rows: T[],
  applicationId: string,
): T[] => rows.filter((row) => row.applicationId === applicationId);

function findApplication(applicationId: string): Application {
  const found = APPLICATIONS.find((app) => app.id === applicationId);
  if (!found) throw new NotFoundError('Application not found');
  return found;
}

function notInEval(): never {
  throw new ValidationError('That tool is not available in this evaluation');
}

function worldDeps(proposals: ChatProposal[]): ChatToolDeps {
  let nextId = 0;
  const deps = {
    getApplicationsPageUseCase: {
      execute: async (input: { status?: string; limit?: number }) => {
        const matching = APPLICATIONS.filter((app) => !input.status || app.status === input.status);
        const items = matching.slice(0, input.limit ?? CHAT.LIST_DEFAULT_LIMIT);
        return { items, nextCursor: null, hasNextPage: items.length < matching.length };
      },
    },
    getApplicationUseCase: {
      execute: async (input: { applicationId: string }) => findApplication(input.applicationId),
    },
    getNotesUseCase: {
      execute: async (input: { applicationId: string }) =>
        forApplication(NOTES, findApplication(input.applicationId).id),
    },
    getContactsUseCase: {
      execute: async (input: { applicationId: string }) =>
        forApplication(CONTACTS, findApplication(input.applicationId).id),
    },
    getInterviewRoundsUseCase: {
      execute: async (input: { applicationId: string }) =>
        forApplication(INTERVIEW_ROUNDS, findApplication(input.applicationId).id),
    },
    getOffersUseCase: {
      execute: async (input: { applicationId: string }) =>
        forApplication(OFFERS, findApplication(input.applicationId).id),
    },
    getDocumentsUseCase: { execute: async () => [] },
    getActivityLogsUseCase: { execute: async () => [] },
    getMockInterviewQuestionsUseCase: { execute: async () => [] },
    generateMockQuestionsUseCase: { execute: notInEval },
    generateMockAnswerUseCase: { execute: notInEval },
    generateTalkingPointsUseCase: { execute: notInEval },
    getCalendarEventsUseCase: {
      execute: async () =>
        INTERVIEW_ROUNDS.flatMap((round) => {
          const app = findApplication(round.applicationId);
          return round.scheduledAt
            ? [
                {
                  id: round.id,
                  applicationId: app.id,
                  company: app.company,
                  role: app.role,
                  type: 'interview',
                  date: round.scheduledAt,
                  interviewRoundType: round.type,
                },
              ]
            : [];
        }),
    },
    getResponseTimeAnalyticsUseCase: { execute: async () => ANALYTICS.responseTime },
    getApplicationChannelAnalyticsUseCase: { execute: async () => ANALYTICS.channels },
    getInterviewRoundAnalyticsUseCase: { execute: async () => ANALYTICS.interviewRounds },
    getOfferAnalyticsUseCase: { execute: async () => ANALYTICS.offers },
    workExperienceRepository: { findAllByUserId: async () => WORK_EXPERIENCES },
    educationRepository: { findAllByUserId: async () => [] },
    skillRepository: { findAllByUserId: async () => SKILLS },
    toolCallObserver: passthroughObserver,
    chatWriteTools: {
      has: (name: string) => WRITE_TOOL_NAMES.has(name),
      prepare: async (name: string, args: Record<string, unknown>) => ({
        args,
        summary: `${name} ${JSON.stringify(args)}`,
      }),
      apply: async () => {
        throw new Error('Chat must never apply a write');
      },
    },
    chatActionProposalRepository: {
      create: async (data: { id: string; toolName: string; summary: string }) => {
        proposals.push({ toolName: data.toolName, summary: data.summary });
        return { id: data.id, summary: data.summary };
      },
      attachToMessage: async () => undefined,
    },
    generateId: () => `eval-${(nextId += 1)}`,
  };
  return deps as unknown as ChatToolDeps;
}

/** The provider, recording each round's tool calls as the use case drives it. */
function recording(provider: ILLMProvider, rounds: ChatCall[][]): ILLMProvider {
  return {
    complete: (...args) => provider.complete(...args),
    async *completeWithToolsStream(...args) {
      for await (const event of provider.completeWithToolsStream(...args)) {
        if (event.type === 'done') {
          rounds.push(
            event.toolCalls.map(({ name, arguments: callArgs }) => ({
              name,
              arguments: callArgs,
            })),
          );
        }
        yield event;
      }
    },
  };
}

type StreamChatDeps = ConstructorParameters<typeof StreamChatWithAssistantUseCase>[0];

/** One user message through the real chat use case. Single turn, empty history. */
export async function runChatTurn(provider: ILLMProvider, message: string): Promise<ChatTrace> {
  const rounds: ChatCall[][] = [];
  const proposals: ChatProposal[] = [];
  const stored: Message[] = [];
  const recorded = recording(provider, rounds);

  const useCase = new StreamChatWithAssistantUseCase({
    ...worldDeps(proposals),
    chatTools: toLlmToolDefinitions(CHAT_TOOLS),
    llmProviderFactory: {
      forUser: async () => recorded,
      resolveForUser: async () => ({
        provider: recorded,
        providerId: 'eval',
        fellBackFrom: null,
        source: 'byok',
      }),
      fromCredentials: () => recorded,
    },
    chatRateLimiter: unlimited,
    messageRepository: {
      findAllByConversationId: async () => [],
      create: async (data: Partial<Message> & Pick<Message, 'role' | 'content'>) => {
        const row = { toolTrace: null, createdAt: new Date(), ...data } as Message;
        stored.push(row);
        return row;
      },
    },
    conversationRepository: {
      findById: async () => ({ id: CONVERSATION_ID, userId: CHAT_USER_ID, llmProvider: 'eval' }),
      updateLlmSettings: async () => undefined,
      updateTitle: async () => undefined,
    },
    userRepository: { findById: async () => ({ id: CHAT_USER_ID, customAiPrompt: null }) },
    generateId: () => `message-${stored.length + 1}`,
  } as unknown as StreamChatDeps);

  // Draining the stream is the turn; the events themselves are the UI's business.
  for await (const _event of useCase.execute({
    userId: CHAT_USER_ID,
    conversationId: CONVERSATION_ID,
    message,
  })) {
    void _event;
  }

  return {
    calls: rounds.flat(),
    rounds: rounds.length,
    answer: stored.find((row) => row.role === 'assistant')?.content ?? '',
    capped: (rounds[rounds.length - 1]?.length ?? 0) > 0,
    proposals,
  };
}
