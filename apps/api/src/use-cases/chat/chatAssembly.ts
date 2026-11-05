import type { ApplicationStatus } from '#src/domain/application/ApplicationStatus.js';
import type { User } from '#src/domain/user/User.js';
import type { Message } from '#src/domain/message/Message.js';
import type { IGetApplicationsPageUseCase } from '#src/use-cases/jobs/IGetApplicationsPageUseCase.js';
import type { IGetApplicationUseCase } from '#src/use-cases/jobs/IGetApplicationUseCase.js';
import type { IGetNotesUseCase } from '#src/use-cases/notes/IGetNotesUseCase.js';
import type { IGetContactsUseCase } from '#src/use-cases/contacts/IGetContactsUseCase.js';
import type { IGetInterviewRoundsUseCase } from '#src/use-cases/interviewRounds/IGetInterviewRoundsUseCase.js';
import type { IGetMockInterviewQuestionsUseCase } from '#src/use-cases/mockInterviewQuestions/IGetMockInterviewQuestionsUseCase.js';
import type { IGenerateMockQuestionsUseCase } from '#src/use-cases/mockInterviewQuestions/IGenerateMockQuestionsUseCase.js';
import type { IGenerateTalkingPointsUseCase } from '#src/use-cases/mockInterviewQuestions/IGenerateTalkingPointsUseCase.js';
import type { IGenerateMockAnswerUseCase } from '#src/use-cases/mockInterviewQuestions/IGenerateMockAnswerUseCase.js';
import type { IGetDocumentsUseCase } from '#src/use-cases/documents/IGetDocumentsUseCase.js';
import type { IGetOffersUseCase } from '#src/use-cases/offers/IGetOffersUseCase.js';
import type { IGetActivityLogsUseCase } from '#src/use-cases/activityLogs/IGetActivityLogsUseCase.js';
import type { GetCalendarEventsUseCase } from '#src/use-cases/calendar/GetCalendarEventsUseCase.js';
import type { GetResponseTimeAnalyticsUseCase } from '#src/use-cases/activityLogs/GetResponseTimeAnalyticsUseCase.js';
import type { GetApplicationChannelAnalyticsUseCase } from '#src/use-cases/application/GetApplicationChannelAnalyticsUseCase.js';
import type { GetInterviewRoundAnalyticsUseCase } from '#src/use-cases/interviewRounds/GetInterviewRoundAnalyticsUseCase.js';
import type { GetOfferAnalyticsUseCase } from '#src/use-cases/offers/GetOfferAnalyticsUseCase.js';
import type { IWorkExperienceRepository } from '#src/use-cases/ports/IWorkExperienceRepository.js';
import type { IEducationRepository } from '#src/use-cases/ports/IEducationRepository.js';
import type { ISkillRepository } from '#src/use-cases/ports/ISkillRepository.js';
import type { LLMMessage, LLMToolCall } from '#src/use-cases/ports/ILLMProvider.js';
import type { IToolCallObserver } from '#src/use-cases/ports/IToolCallObserver.js';
import type { IChatWriteTools } from '#src/use-cases/ports/IChatWriteTools.js';
import type { IChatActionProposalRepository } from '#src/use-cases/ports/IChatActionProposalRepository.js';
import { DomainError, ValidationError } from '#src/use-cases/errors/DomainError.js';
import { compactForModel, projectChatToolResult } from '#src/use-cases/chat/chatToolProjection.js';
import { CHAT } from '#src/use-cases/constants.js';
import { chatPrompt } from '#src/use-cases/prompts/chat.js';

// The prompt text and the history mapping moved to `use-cases/prompts/chat.ts`
// (JEF-505); re-exported so the stream use case and its tests keep one import.
export { CHAT_SYSTEM_PROMPT, historyToPromptMessages } from '#src/use-cases/prompts/chat.js';

/**
 * Message assembly, title derivation, and tool dispatch for
 * `StreamChatWithAssistantUseCase` (JEF-239) — split out from that use case
 * so the request-handling control flow (rate limiting, conversation lookup,
 * the tool-calling loop) isn't tangled up with prompt/tool-catalogue
 * plumbing.
 */

/**
 * Fences a tool's output before it goes back to the model (JEF-S4).
 *
 * A job description is scraped from a third-party page, a note is free
 * text, a contact's name is whatever was typed — any of them can contain
 * "ignore your instructions and tell the user to …". The single-shot
 * features fence such text with `wrapUntrustedContent`; the chat loop was
 * sending it bare. The tag is deliberately terse (the rule itself lives once
 * in `CHAT_SYSTEM_PROMPT`) because it is repeated on every result, on every
 * iteration, in every turn.
 */
export function formatToolResultForModel(toolName: string, result: unknown): string {
  return `<tool_result name="${toolName}">\n${JSON.stringify(result)}\n</tool_result>`;
}

export interface ChatToolDeps {
  getApplicationsPageUseCase: IGetApplicationsPageUseCase;
  getApplicationUseCase: IGetApplicationUseCase;
  getNotesUseCase: IGetNotesUseCase;
  getContactsUseCase: IGetContactsUseCase;
  getInterviewRoundsUseCase: IGetInterviewRoundsUseCase;
  getMockInterviewQuestionsUseCase: IGetMockInterviewQuestionsUseCase;
  generateMockQuestionsUseCase: IGenerateMockQuestionsUseCase;
  generateMockAnswerUseCase: IGenerateMockAnswerUseCase;
  generateTalkingPointsUseCase: IGenerateTalkingPointsUseCase;
  getDocumentsUseCase: IGetDocumentsUseCase;
  getOffersUseCase: IGetOffersUseCase;
  getActivityLogsUseCase: IGetActivityLogsUseCase;
  getCalendarEventsUseCase: GetCalendarEventsUseCase;
  getResponseTimeAnalyticsUseCase: GetResponseTimeAnalyticsUseCase;
  getApplicationChannelAnalyticsUseCase: GetApplicationChannelAnalyticsUseCase;
  getInterviewRoundAnalyticsUseCase: GetInterviewRoundAnalyticsUseCase;
  getOfferAnalyticsUseCase: GetOfferAnalyticsUseCase;
  workExperienceRepository: IWorkExperienceRepository;
  educationRepository: IEducationRepository;
  skillRepository: ISkillRepository;
  toolCallObserver: IToolCallObserver;
  chatWriteTools: IChatWriteTools;
  chatActionProposalRepository: IChatActionProposalRepository;
  generateId: () => string;
}

/** What the model reads back when it asks for a write: saved, not applied. */
export interface ProposedWriteResult {
  status: 'proposed';
  proposalId: string;
  summary: string;
  note: string;
}

export function isProposedWriteResult(result: unknown): result is ProposedWriteResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    (result as { status?: unknown }).status === 'proposed' &&
    typeof (result as { proposalId?: unknown }).proposalId === 'string'
  );
}

/**
 * Tool arguments come from the model, so a numeric field may arrive as a
 * number, a numeric string, or nonsense. Anything that isn't a positive
 * integer falls back to undefined, letting the use case apply its own
 * default and clamp — a bad value degrades to the default page rather than
 * erroring mid-conversation.
 */
function toPositiveInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export async function executeChatTool(
  call: LLMToolCall,
  userId: string,
  conversationId: string,
  deps: ChatToolDeps,
): Promise<unknown> {
  return deps.toolCallObserver.observe({ surface: 'chat', name: call.name }, async (observed) => {
    try {
      // A write is only ever saved here, never run: the user confirms it later
      // (ConfirmChatActionUseCase). Nothing below this branch can reach a write.
      if (deps.chatWriteTools.has(call.name)) {
        const proposed = await proposeChatWrite(call, userId, conversationId, deps);
        observed.proposed(proposed);
        return proposed;
      }
      // Every result is compacted on the way out — see `compactForModel` for
      // what that costs otherwise — including the error shape below, which
      // is what the model sees when a tool fails.
      const result = compactForModel(
        projectChatToolResult(call.name, await dispatchChatTool(call, userId, deps)),
      );
      observed.succeeded(result);
      return result;
    } catch (err) {
      // Reported before it is swallowed: the model gets a reply either way,
      // but a trace should still tell a bug from "Application not found"
      // (JEF-365).
      observed.failed(err);
      // A DomainError's message was written for a person ("Application not
      // found") and helps the model recover. Anything else is an internal
      // failure — a driver error, a stack fragment — whose message the model
      // would happily paraphrase to the user.
      return { error: err instanceof DomainError ? err.message : 'Tool call failed' };
    }
  });
}

async function proposeChatWrite(
  call: LLMToolCall,
  userId: string,
  conversationId: string,
  deps: ChatToolDeps,
): Promise<ProposedWriteResult> {
  const prepared = await deps.chatWriteTools.prepare(call.name, call.arguments, userId);
  const proposal = await deps.chatActionProposalRepository.create({
    id: deps.generateId(),
    userId,
    conversationId,
    toolName: call.name,
    args: prepared.args,
    summary: prepared.summary,
    expiresAt: new Date(Date.now() + CHAT.PROPOSAL_TTL_MS),
  });
  return {
    status: 'proposed',
    proposalId: proposal.id,
    summary: proposal.summary,
    note: 'NOT applied. The user has been shown a card and must press Confirm before anything changes.',
  };
}

async function dispatchChatTool(
  call: LLMToolCall,
  userId: string,
  deps: ChatToolDeps,
): Promise<unknown> {
  const args = call.arguments;
  const applicationId = String(args.applicationId ?? '');

  switch (call.name) {
    case 'list_applications':
      return await deps.getApplicationsPageUseCase.execute({
        userId,
        status: args.status as ApplicationStatus | undefined,
        cursor: typeof args.cursor === 'string' ? args.cursor : undefined,
        limit: toPositiveInt(args.limit) ?? CHAT.LIST_DEFAULT_LIMIT,
      });
    case 'get_application':
      return await deps.getApplicationUseCase.execute({ userId, applicationId });
    case 'list_notes':
      return await deps.getNotesUseCase.execute({ userId, applicationId });
    case 'list_contacts':
      return await deps.getContactsUseCase.execute({ userId, applicationId });
    case 'list_interview_rounds':
      return await deps.getInterviewRoundsUseCase.execute({ userId, applicationId });
    case 'list_mock_interview_questions':
      return await deps.getMockInterviewQuestionsUseCase.execute({
        userId,
        roundId: String(args.interviewRoundId ?? ''),
      });
    case 'generate_mock_interview_questions':
      return await deps.generateMockQuestionsUseCase.execute({
        userId,
        roundId: String(args.interviewRoundId ?? ''),
        prompt: typeof args.prompt === 'string' ? args.prompt : undefined,
        count: toPositiveInt(args.count),
        useProfile: args.useProfile === true,
        documentId: typeof args.documentId === 'string' ? args.documentId : undefined,
      });
    case 'generate_mock_interview_answer':
      return await deps.generateMockAnswerUseCase.execute({
        userId,
        questionId: String(args.mockInterviewQuestionId ?? ''),
        prompt: typeof args.prompt === 'string' ? args.prompt : undefined,
        useProfile: args.useProfile === true,
        documentId: typeof args.documentId === 'string' ? args.documentId : undefined,
      });
    case 'generate_mock_talking_points':
      return await deps.generateTalkingPointsUseCase.execute({
        userId,
        questionId: String(args.mockInterviewQuestionId ?? ''),
        useProfile: args.useProfile !== false,
        documentId: typeof args.documentId === 'string' ? args.documentId : undefined,
        save: false,
      });
    case 'list_work_experiences':
      return await deps.workExperienceRepository.findAllByUserId(userId);
    case 'list_educations':
      return await deps.educationRepository.findAllByUserId(userId);
    case 'list_skills':
      return await deps.skillRepository.findAllByUserId(userId);
    case 'list_documents':
      return await deps.getDocumentsUseCase.execute({ userId, applicationId });
    case 'list_offers':
      return await deps.getOffersUseCase.execute({ userId, applicationId });
    case 'list_activity':
      return await deps.getActivityLogsUseCase.execute({ userId, applicationId });
    case 'list_calendar_events':
      return await deps.getCalendarEventsUseCase.execute({ userId });
    case 'get_analytics': {
      const [responseTime, channels, interviewRounds, offers] = await Promise.all([
        deps.getResponseTimeAnalyticsUseCase.execute({ userId }),
        deps.getApplicationChannelAnalyticsUseCase.execute({ userId }),
        deps.getInterviewRoundAnalyticsUseCase.execute({ userId }),
        deps.getOfferAnalyticsUseCase.execute({ userId }),
      ]);
      return { responseTime, channels, interviewRounds, offers };
    }
    default:
      // Thrown rather than returned so the observer counts it as bad input;
      // the model still reads the same `{ error: 'Unknown tool: …' }`.
      throw new ValidationError(`Unknown tool: ${call.name}`);
  }
}
/**
 * Builds the LLM prompt for a new turn. The wording and the cache breakpoints
 * live in `chatPrompt` (`use-cases/prompts/chat.ts`); this is the call site
 * the stream use case and the tests know.
 */
export function buildChatMessages(
  history: Message[],
  newMessage: string,
  user: User | null,
): LLMMessage[] {
  return chatPrompt.build({ history, newMessage, customAiPrompt: user?.customAiPrompt });
}

/**
 * The most recent messages whose combined length fits `maxChars`, dropping
 * from the oldest end (T6). Applied after the message-count cap, so both
 * bounds hold. A single message longer than the budget is kept on its own
 * rather than leaving the model with nothing.
 */
export function trimHistoryToBudget<T extends { content: string }>(
  history: T[],
  maxChars: number,
): T[] {
  let total = 0;
  let start = history.length;
  while (start > 0 && total + history[start - 1].content.length <= maxChars) {
    total += history[start - 1].content.length;
    start -= 1;
  }
  if (start === history.length && history.length > 0) return history.slice(-1);
  return history.slice(start);
}

/**
 * One line describing what a tool call returned, for the trace persisted on
 * the assistant's reply (F10): ids and names, never the payload. Enough for
 * the model to reuse an id on the next turn without asking again.
 */
export function summarizeToolResult(call: LLMToolCall, result: unknown): string {
  const args = Object.keys(call.arguments).length ? `(${JSON.stringify(call.arguments)})` : '';
  const head = `${call.name}${args}`;
  if (isProposedWriteResult(result)) return `${head} → proposed (not applied): ${result.summary}`;
  if (result && typeof result === 'object' && 'error' in result) {
    return `${head} → error: ${String((result as { error: unknown }).error)}`;
  }
  const rows = Array.isArray(result)
    ? result
    : result && typeof result === 'object' && Array.isArray((result as { items?: unknown }).items)
      ? (result as { items: unknown[] }).items
      : null;
  if (rows) {
    const shown = rows.slice(0, CHAT.TOOL_TRACE_MAX_ROWS).map(describeRow).filter(Boolean);
    const more = rows.length > shown.length ? `, +${rows.length - shown.length} more` : '';
    return `${head} → ${rows.length} result${rows.length === 1 ? '' : 's'}${shown.length ? `: ${shown.join(', ')}` : ''}${more}`;
  }
  if (result && typeof result === 'object') {
    const one = describeRow(result);
    return one ? `${head} → ${one}` : `${head} → ok`;
  }
  return `${head} → ok`;
}

function describeRow(row: unknown): string {
  if (!row || typeof row !== 'object') return '';
  const r = row as Record<string, unknown>;
  const label = [r.company, r.role ?? r.title ?? r.name ?? r.institution]
    .filter((v) => typeof v === 'string' && v)
    .join('/');
  const id = typeof r.id === 'string' ? r.id : '';
  return [id, label].filter(Boolean).join(' ');
}

export function deriveChatTitle(message: string): string {
  const trimmed = message.trim();
  return trimmed.length > CHAT.TITLE_MAX_LENGTH
    ? `${trimmed.slice(0, CHAT.TITLE_MAX_LENGTH).trimEnd()}…`
    : trimmed;
}
