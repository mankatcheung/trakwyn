import type { ApplicationStatus } from '#src/domain/application/ApplicationStatus.js';
import type { IGetApplicationsPageUseCase } from '#src/use-cases/jobs/IGetApplicationsPageUseCase.js';
import type { IGetApplicationUseCase } from '#src/use-cases/jobs/IGetApplicationUseCase.js';
import type { IGetNotesUseCase } from '#src/use-cases/notes/IGetNotesUseCase.js';
import type { IGetContactsUseCase } from '#src/use-cases/contacts/IGetContactsUseCase.js';
import type { IGetInterviewRoundsUseCase } from '#src/use-cases/interviewRounds/IGetInterviewRoundsUseCase.js';
import type { IGetDocumentsUseCase } from '#src/use-cases/documents/IGetDocumentsUseCase.js';
import type { IGetMockInterviewQuestionsUseCase } from '#src/use-cases/mockInterviewQuestions/IGetMockInterviewQuestionsUseCase.js';
import type { IGenerateMockQuestionsUseCase } from '#src/use-cases/mockInterviewQuestions/IGenerateMockQuestionsUseCase.js';
import type { IGenerateTalkingPointsUseCase } from '#src/use-cases/mockInterviewQuestions/IGenerateTalkingPointsUseCase.js';
import type { IGenerateMockAnswerUseCase } from '#src/use-cases/mockInterviewQuestions/IGenerateMockAnswerUseCase.js';
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
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import { API_TOKEN_SCOPE } from '#src/use-cases/constants.js';
import { projectApplicationSummary } from '#src/use-cases/chat/chatToolProjection.js';
import { JSON_RPC_ERROR, MCP, MCP_METHOD } from '#src/interface-adapters/mcp/constants.js';
import type { McpActor } from '#src/use-cases/shared/mcpActor.js';
import type { ApiTokenScope } from '#src/domain/apiToken/ApiToken.js';
import type {
  IToolCallObserver,
  ToolCallRecorder,
} from '#src/use-cases/ports/IToolCallObserver.js';
import { MCP_TOOLS } from '#src/interface-adapters/llm/toolCatalogue.js';
import {
  negotiateProtocolVersion,
  toMcpToolDefinitions,
} from '#src/interface-adapters/mcp/mcpToolDefinitions.js';
import { toPositiveInt, toStr, type ToolArgs } from '#src/interface-adapters/mcp/toolArgs.js';
import {
  writeToolHandler,
  type WriteToolDeps,
} from '#src/interface-adapters/mcp/writeToolHandlers.js';

// Re-exported for convenience: this adapter is where MCP's catalogue is
// consumed, even though it's no longer where it's defined (JEF-177).
export { MCP_TOOLS };

/**
 * Use-case failures a client can act on, answered as INVALID_PARAMS with the
 * code in `error.data`; anything else is INTERNAL_ERROR. PLAN_REQUIRED is
 * here so `create_offer` on Free reads as "upgrade", not as a server fault.
 */
const CLIENT_ERROR_CODES: ReadonlySet<string> = new Set([
  ERROR_CODES.NOT_FOUND,
  ERROR_CODES.FORBIDDEN,
  ERROR_CODES.PLAN_REQUIRED,
]);

/** HTTP status for a malformed JSON-RPC envelope (matches Fastify `reply.code`). */
const HTTP_BAD_REQUEST = 400;

/** A single inbound JSON-RPC 2.0 message. */
export interface McpRequest {
  jsonrpc: string;
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * The controller's response to the transport: a JSON-RPC `body` plus an
 * optional HTTP `status` override. Protocol-level errors (unknown method,
 * unknown tool) travel as normal `200` JSON-RPC error bodies; only a malformed
 * envelope maps to a non-200 status.
 */
export interface McpResult {
  status?: number;
  body: unknown;
}

interface Deps extends WriteToolDeps {
  getApplicationsPageUseCase: IGetApplicationsPageUseCase;
  getApplicationUseCase: IGetApplicationUseCase;
  getNotesUseCase: IGetNotesUseCase;
  getContactsUseCase: IGetContactsUseCase;
  getInterviewRoundsUseCase: IGetInterviewRoundsUseCase;
  getDocumentsUseCase: IGetDocumentsUseCase;
  getOffersUseCase: IGetOffersUseCase;
  getActivityLogsUseCase: IGetActivityLogsUseCase;
  getCalendarEventsUseCase: GetCalendarEventsUseCase;
  getResponseTimeAnalyticsUseCase: GetResponseTimeAnalyticsUseCase;
  getApplicationChannelAnalyticsUseCase: GetApplicationChannelAnalyticsUseCase;
  getInterviewRoundAnalyticsUseCase: GetInterviewRoundAnalyticsUseCase;
  getOfferAnalyticsUseCase: GetOfferAnalyticsUseCase;
  getMockInterviewQuestionsUseCase: IGetMockInterviewQuestionsUseCase;
  generateMockQuestionsUseCase: IGenerateMockQuestionsUseCase;
  generateMockAnswerUseCase: IGenerateMockAnswerUseCase;
  generateTalkingPointsUseCase: IGenerateTalkingPointsUseCase;
  workExperienceRepository: IWorkExperienceRepository;
  educationRepository: IEducationRepository;
  skillRepository: ISkillRepository;
  toolCallObserver: IToolCallObserver;
  /** `tools/call` budgets (JEF-465): reads and writes are counted apart. */
  mcpToolCallReadRateLimiter: IRateLimiter;
  mcpToolCallWriteRateLimiter: IRateLimiter;
  /** What `retryAfterSeconds` says when a budget is spent. */
  mcpToolCallRetryAfterS: number;
}

/**
 * Translates MCP JSON-RPC requests into use-case calls. This is the interface
 * adapter for the MCP transport — the equivalent of a GraphQL resolver, kept
 * out of the Fastify plugin so the plugin stays pure transport (auth + I/O).
 */
export class McpController {
  constructor(private readonly deps: Deps) {}

  /**
   * `tokenId` names the credential whose call budget a `tools/call` spends;
   * without one the budget is the user's. `actor` says which credential made
   * a write, for the activity log and the tool span (JEF-466).
   */
  async handle(
    rawBody: unknown,
    userId: string,
    scope: ApiTokenScope,
    tokenId?: string,
    actor?: McpActor,
  ): Promise<McpResult> {
    const body = rawBody as McpRequest | null | undefined;

    if (!body || body.jsonrpc !== MCP.JSONRPC_VERSION || !body.method) {
      return {
        status: HTTP_BAD_REQUEST,
        body: this.error(body?.id ?? null, JSON_RPC_ERROR.INVALID_REQUEST, 'Invalid Request'),
      };
    }

    const { id, method, params } = body;

    if (method === MCP_METHOD.INITIALIZE) {
      return {
        body: {
          jsonrpc: MCP.JSONRPC_VERSION,
          id,
          result: {
            protocolVersion: negotiateProtocolVersion(params?.protocolVersion),
            capabilities: { tools: {} },
            serverInfo: { name: MCP.SERVER_NAME, version: MCP.SERVER_VERSION },
            instructions: MCP.INSTRUCTIONS,
          },
        },
      };
    }

    if (method === MCP_METHOD.TOOLS_LIST) {
      // A read-only token isn't shown write tools at all. Enforcement still
      // happens in tools/call — hiding them is a convenience for the model,
      // not the security boundary.
      const visible =
        scope === API_TOKEN_SCOPE.FULL ? MCP_TOOLS : MCP_TOOLS.filter((t) => t.access === 'read');
      return {
        body: {
          jsonrpc: MCP.JSONRPC_VERSION,
          id,
          result: { tools: toMcpToolDefinitions(visible) },
        },
      };
    }

    if (method === MCP_METHOD.TOOLS_CALL) {
      return {
        body: await this.callTool(id, params, userId, scope, tokenId ?? `user:${userId}`, actor),
      };
    }

    return { body: this.error(id, JSON_RPC_ERROR.METHOD_NOT_FOUND, `Method not found: ${method}`) };
  }

  private async callTool(
    id: McpRequest['id'],
    params: McpRequest['params'],
    userId: string,
    scope: ApiTokenScope,
    budgetKey: string,
    actor?: McpActor,
  ): Promise<unknown> {
    const requested = (params as { name?: unknown } | undefined)?.name;
    const toolName = typeof requested === 'string' ? requested : undefined;
    // Wraps the whole call, refusal and argument checks included, so every
    // tools/call is one span and one count however it ends (JEF-365).
    return this.deps.toolCallObserver.observe(
      { surface: 'mcp', name: toolName ?? '', tokenScope: scope, tokenId: actor?.apiTokenId },
      (observed) => this.runTool(id, toolName, params, userId, scope, budgetKey, observed, actor),
    );
  }

  private async runTool(
    id: McpRequest['id'],
    toolName: string | undefined,
    params: McpRequest['params'],
    userId: string,
    scope: ApiTokenScope,
    budgetKey: string,
    observed: ToolCallRecorder,
    actor?: McpActor,
  ): Promise<unknown> {
    // The security boundary. tools/list already hides write tools from a
    // read-only token, but a client can call anything it likes regardless,
    // so refusal has to happen here — otherwise a token the UI and README
    // both describe as unable to change anything could mutate data (JEF-170).
    const tool = MCP_TOOLS.find((t) => t.name === toolName);
    if (tool?.access === 'write' && scope !== API_TOKEN_SCOPE.FULL) {
      observed.refused(userId);
      return this.error(
        id,
        JSON_RPC_ERROR.INVALID_PARAMS,
        `Tool "${toolName}" requires a full-access API token; this token is read-only`,
      );
    }

    // After the scope check, so a refused call spends nothing, and before any
    // dispatch. An unknown tool name runs nothing, so it is not counted (JEF-465).
    if (tool && !(await this.withinBudget(tool.access, budgetKey))) {
      observed.rateLimited();
      return this.error(
        id,
        JSON_RPC_ERROR.RATE_LIMITED,
        `Too many ${tool.access} tool calls. Wait before calling "${toolName}" again.`,
        { code: ERROR_CODES.RATE_LIMITED, retryAfterSeconds: this.deps.mcpToolCallRetryAfterS },
      );
    }

    // Not Record<string, string>: JSON-RPC arguments are arbitrary JSON, and
    // `limit` legitimately arrives as a number. Narrow per field below.
    const args = (params as { arguments?: ToolArgs } | undefined)?.arguments ?? {};

    try {
      let result: unknown;

      switch (toolName) {
        case 'list_applications': {
          // Same preview rows the chat assistant gets (T1/F4): a page of
          // whole rows carried up to 20 scraped job descriptions, and the
          // full text is one get_application away. Nulls are kept — an MCP
          // client is a program, and a missing field reads as absent.
          const page = await this.deps.getApplicationsPageUseCase.execute({
            userId,
            status: toStr(args.status) as ApplicationStatus | undefined,
            cursor: toStr(args.cursor),
            limit: toPositiveInt(args.limit),
          });
          result = { ...page, items: page.items.map(projectApplicationSummary) };
          break;
        }
        case 'get_application':
          if (!toStr(args.applicationId)) {
            return this.invalid(observed, id, 'applicationId is required');
          }
          result = await this.deps.getApplicationUseCase.execute({
            applicationId: toStr(args.applicationId)!,
            userId,
          });
          break;
        case 'list_notes':
          if (!toStr(args.applicationId)) {
            return this.invalid(observed, id, 'applicationId is required');
          }
          result = await this.deps.getNotesUseCase.execute({
            applicationId: toStr(args.applicationId)!,
            userId,
          });
          break;
        case 'list_contacts':
          if (!toStr(args.applicationId)) {
            return this.invalid(observed, id, 'applicationId is required');
          }
          result = await this.deps.getContactsUseCase.execute({
            applicationId: toStr(args.applicationId)!,
            userId,
          });
          break;
        case 'list_interview_rounds':
          if (!toStr(args.applicationId)) {
            return this.invalid(observed, id, 'applicationId is required');
          }
          result = await this.deps.getInterviewRoundsUseCase.execute({
            applicationId: toStr(args.applicationId)!,
            userId,
          });
          break;
        case 'list_mock_interview_questions': {
          const interviewRoundId = toStr(args.interviewRoundId);
          if (!interviewRoundId) {
            return this.invalid(observed, id, 'interviewRoundId is required');
          }
          result = await this.deps.getMockInterviewQuestionsUseCase.execute({
            userId,
            roundId: interviewRoundId,
          });
          break;
        }
        case 'generate_mock_interview_questions': {
          const interviewRoundId = toStr(args.interviewRoundId);
          if (!interviewRoundId) {
            return this.invalid(observed, id, 'interviewRoundId is required');
          }
          result = await this.deps.generateMockQuestionsUseCase.execute({
            userId,
            roundId: interviewRoundId,
            prompt: toStr(args.prompt),
            count: toPositiveInt(args.count),
            useProfile: args.useProfile === true,
            documentId: toStr(args.documentId),
          });
          break;
        }
        case 'generate_mock_interview_answer': {
          const mockInterviewQuestionId = toStr(args.mockInterviewQuestionId);
          if (!mockInterviewQuestionId) {
            return this.invalid(observed, id, 'mockInterviewQuestionId is required');
          }
          result = await this.deps.generateMockAnswerUseCase.execute({
            userId,
            questionId: mockInterviewQuestionId,
            prompt: toStr(args.prompt),
            useProfile: args.useProfile === true,
            documentId: toStr(args.documentId),
          });
          break;
        }
        case 'generate_mock_talking_points': {
          const mockInterviewQuestionId = toStr(args.mockInterviewQuestionId);
          if (!mockInterviewQuestionId) {
            return this.invalid(observed, id, 'mockInterviewQuestionId is required');
          }
          result = await this.deps.generateTalkingPointsUseCase.execute({
            userId,
            questionId: mockInterviewQuestionId,
            useProfile: args.useProfile !== false,
            documentId: toStr(args.documentId),
            save: false,
          });
          break;
        }
        case 'list_work_experiences':
          result = await this.deps.workExperienceRepository.findAllByUserId(userId);
          break;
        case 'list_educations':
          result = await this.deps.educationRepository.findAllByUserId(userId);
          break;
        case 'list_skills':
          result = await this.deps.skillRepository.findAllByUserId(userId);
          break;
        case 'list_documents':
          if (!toStr(args.applicationId)) {
            return this.invalid(observed, id, 'applicationId is required');
          }
          result = await this.deps.getDocumentsUseCase.execute({
            applicationId: toStr(args.applicationId)!,
            userId,
          });
          break;
        case 'list_offers':
          if (!toStr(args.applicationId)) {
            return this.invalid(observed, id, 'applicationId is required');
          }
          result = await this.deps.getOffersUseCase.execute({
            applicationId: toStr(args.applicationId)!,
            userId,
          });
          break;
        case 'list_activity':
          if (!toStr(args.applicationId)) {
            return this.invalid(observed, id, 'applicationId is required');
          }
          result = await this.deps.getActivityLogsUseCase.execute({
            applicationId: toStr(args.applicationId)!,
            userId,
          });
          break;
        case 'list_calendar_events':
          result = await this.deps.getCalendarEventsUseCase.execute({ userId });
          break;
        case 'get_analytics': {
          // Fetched together: each is a compact aggregate, and "how is my
          // search going?" wants all four. Splitting into four tools would
          // cost more in advertised schema than it saves in payload.
          const [responseTime, channels, interviewRounds, offers] = await Promise.all([
            this.deps.getResponseTimeAnalyticsUseCase.execute({ userId }),
            this.deps.getApplicationChannelAnalyticsUseCase.execute({ userId }),
            this.deps.getInterviewRoundAnalyticsUseCase.execute({ userId }),
            this.deps.getOfferAnalyticsUseCase.execute({ userId }),
          ]);
          result = { responseTime, channels, interviewRounds, offers };
          break;
        }
        default: {
          // Every write tool, dispatched from one table keyed by the
          // catalogue's write-tool names (writeToolHandlers.ts).
          const handler = writeToolHandler(toolName);
          if (!handler) {
            observed.invalidParams();
            return this.error(id, JSON_RPC_ERROR.METHOD_NOT_FOUND, `Unknown tool: ${toolName}`);
          }
          const outcome = await handler(args, userId, this.deps, actor);
          if ('invalid' in outcome) return this.invalid(observed, id, outcome.invalid);
          result = outcome.result;
        }
      }

      // Compact, not pretty-printed: this goes straight into an LLM's context
      // window, where two-space indentation on every line of a page of results
      // is pure token cost with no reader to benefit from it.
      const text = JSON.stringify(result);
      observed.succeeded(text);
      return { jsonrpc: MCP.JSONRPC_VERSION, id, result: this.text(text) };
    } catch (err) {
      observed.failed(err);
      const code = (err as { code?: string }).code;
      const message = err instanceof Error ? err.message : 'Internal error';
      if (code !== undefined && CLIENT_ERROR_CODES.has(code)) {
        return this.error(id, JSON_RPC_ERROR.INVALID_PARAMS, message, { code });
      }
      return this.error(id, JSON_RPC_ERROR.INTERNAL_ERROR, message);
    }
  }

  /**
   * Spends one call from the credential's read or write budget. The prefix
   * keeps the two apart: the Redis limiter keys on the string alone, so the
   * same token id in both would be one bucket.
   */
  private withinBudget(access: 'read' | 'write', budgetKey: string): Promise<boolean> {
    const limiter =
      access === 'write'
        ? this.deps.mcpToolCallWriteRateLimiter
        : this.deps.mcpToolCallReadRateLimiter;
    return limiter.consume(`mcp-tool-call-${access}:${budgetKey}`);
  }

  private text(text: string) {
    return { content: [{ type: 'text', text }] };
  }

  /** An argument check failed: reported to the observer, then answered as INVALID_PARAMS. */
  private invalid(observed: ToolCallRecorder, id: McpRequest['id'], message: string) {
    observed.invalidParams();
    return this.error(id, JSON_RPC_ERROR.INVALID_PARAMS, message);
  }

  private error(
    id: McpRequest['id'],
    code: number,
    message: string,
    data?: { code: string; retryAfterSeconds?: number },
  ) {
    return {
      jsonrpc: MCP.JSONRPC_VERSION,
      id,
      error: { code, message, ...(data ? { data } : {}) },
    };
  }
}
