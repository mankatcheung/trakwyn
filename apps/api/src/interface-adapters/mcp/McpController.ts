import type { ApplicationStatus } from '#src/domain/application/ApplicationStatus.js';
import type { InterviewRoundType } from '#src/domain/interviewRound/InterviewRound.js';
import type { IGetApplicationsPageUseCase } from '#src/use-cases/jobs/IGetApplicationsPageUseCase.js';
import type { IGetApplicationUseCase } from '#src/use-cases/jobs/IGetApplicationUseCase.js';
import type { IGetNotesUseCase } from '#src/use-cases/notes/IGetNotesUseCase.js';
import type { IGetContactsUseCase } from '#src/use-cases/contacts/IGetContactsUseCase.js';
import type { IGetInterviewRoundsUseCase } from '#src/use-cases/interviewRounds/IGetInterviewRoundsUseCase.js';
import type { IGetDocumentsUseCase } from '#src/use-cases/documents/IGetDocumentsUseCase.js';
import type { ICreateApplicationUseCase } from '#src/use-cases/jobs/ICreateApplicationUseCase.js';
import type { IUpdateApplicationUseCase } from '#src/use-cases/jobs/IUpdateApplicationUseCase.js';
import type { ICreateNoteUseCase } from '#src/use-cases/notes/ICreateNoteUseCase.js';
import type { ICreateInterviewRoundUseCase } from '#src/use-cases/interviewRounds/ICreateInterviewRoundUseCase.js';
import type { ICreateSkillUseCase } from '#src/use-cases/skill/ICreateSkillUseCase.js';
import type { IUpdateSkillUseCase } from '#src/use-cases/skill/IUpdateSkillUseCase.js';
import type { ICreateEducationUseCase } from '#src/use-cases/education/ICreateEducationUseCase.js';
import type { IUpdateEducationUseCase } from '#src/use-cases/education/IUpdateEducationUseCase.js';
import type { ICreateWorkExperienceUseCase } from '#src/use-cases/workExperience/ICreateWorkExperienceUseCase.js';
import type { IUpdateWorkExperienceUseCase } from '#src/use-cases/workExperience/IUpdateWorkExperienceUseCase.js';
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
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import { API_TOKEN_SCOPE } from '#src/use-cases/constants.js';
import { projectApplicationSummary } from '#src/use-cases/chat/chatToolProjection.js';
import { JSON_RPC_ERROR, MCP } from '#src/interface-adapters/mcp/constants.js';
import type { ApiTokenScope } from '#src/domain/apiToken/ApiToken.js';
import { MCP_TOOLS } from '#src/interface-adapters/llm/toolCatalogue.js';

// Re-exported for convenience: this adapter is where MCP's catalogue is
// consumed, even though it's no longer where it's defined (JEF-177).
export { MCP_TOOLS };

/**
 * Tool arguments arrive straight off a JSON-RPC payload, so a numeric field
 * may show up as a number, a numeric string, or something unusable. Coerce
 * leniently and fall back to `undefined` for anything that isn't a positive
 * integer — the use case then applies its own default and clamps to
 * PAGINATION.MAX_LIMIT, so a bad value degrades to the default page rather
 * than erroring or being silently honoured.
 */
function toStr(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Strips the internal `access` tag — it's this server's metadata for scope
 * gating, not part of MCP's tool shape, so it never goes over the wire.
 */
function advertise(tools: readonly (typeof MCP_TOOLS)[number][]) {
  return tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

/**
 * Models emit dates as strings of varying quality. Anything that isn't a
 * real date becomes undefined rather than an Invalid Date, which would
 * otherwise reach the DB as NaN and be far harder to diagnose.
 */
function toDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function toPositiveInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

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

interface Deps {
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
  createApplicationUseCase: ICreateApplicationUseCase;
  updateApplicationUseCase: IUpdateApplicationUseCase;
  createNoteUseCase: ICreateNoteUseCase;
  createInterviewRoundUseCase: ICreateInterviewRoundUseCase;
  createSkillUseCase: ICreateSkillUseCase;
  updateSkillUseCase: IUpdateSkillUseCase;
  createEducationUseCase: ICreateEducationUseCase;
  updateEducationUseCase: IUpdateEducationUseCase;
  createWorkExperienceUseCase: ICreateWorkExperienceUseCase;
  updateWorkExperienceUseCase: IUpdateWorkExperienceUseCase;
  workExperienceRepository: IWorkExperienceRepository;
  educationRepository: IEducationRepository;
  skillRepository: ISkillRepository;
}

/**
 * Translates MCP JSON-RPC requests into use-case calls. This is the interface
 * adapter for the MCP transport — the equivalent of a GraphQL resolver, kept
 * out of the Fastify plugin so the plugin stays pure transport (auth + I/O).
 */
export class McpController {
  constructor(private readonly deps: Deps) {}

  async handle(rawBody: unknown, userId: string, scope: ApiTokenScope): Promise<McpResult> {
    const body = rawBody as McpRequest | null | undefined;

    if (!body || body.jsonrpc !== MCP.JSONRPC_VERSION || !body.method) {
      return {
        status: HTTP_BAD_REQUEST,
        body: this.error(body?.id ?? null, JSON_RPC_ERROR.INVALID_REQUEST, 'Invalid Request'),
      };
    }

    const { id, method, params } = body;

    if (method === 'initialize') {
      return {
        body: {
          jsonrpc: MCP.JSONRPC_VERSION,
          id,
          result: {
            protocolVersion: MCP.PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: MCP.SERVER_NAME, version: MCP.SERVER_VERSION },
            instructions: MCP.INSTRUCTIONS,
          },
        },
      };
    }

    if (method === 'tools/list') {
      // A read-only token isn't shown write tools at all. Enforcement still
      // happens in tools/call — hiding them is a convenience for the model,
      // not the security boundary.
      const visible =
        scope === API_TOKEN_SCOPE.FULL ? MCP_TOOLS : MCP_TOOLS.filter((t) => t.access === 'read');
      return { body: { jsonrpc: MCP.JSONRPC_VERSION, id, result: { tools: advertise(visible) } } };
    }

    if (method === 'tools/call') {
      return { body: await this.callTool(id, params, userId, scope) };
    }

    return { body: this.error(id, JSON_RPC_ERROR.METHOD_NOT_FOUND, `Method not found: ${method}`) };
  }

  private async callTool(
    id: McpRequest['id'],
    params: McpRequest['params'],
    userId: string,
    scope: ApiTokenScope,
  ): Promise<unknown> {
    const toolName = (params as { name?: string } | undefined)?.name;

    // The security boundary. tools/list already hides write tools from a
    // read-only token, but a client can call anything it likes regardless,
    // so refusal has to happen here — otherwise a token the UI and README
    // both describe as unable to change anything could mutate data (JEF-170).
    const tool = MCP_TOOLS.find((t) => t.name === toolName);
    if (tool?.access === 'write' && scope !== API_TOKEN_SCOPE.FULL) {
      return this.error(
        id,
        JSON_RPC_ERROR.INVALID_PARAMS,
        `Tool "${toolName}" requires a full-access API token; this token is read-only`,
      );
    }

    // Not Record<string, string>: JSON-RPC arguments are arbitrary JSON, and
    // `limit` legitimately arrives as a number. Narrow per field below.
    const args = (params as { arguments?: Record<string, unknown> } | undefined)?.arguments ?? {};

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
            return this.error(id, JSON_RPC_ERROR.INVALID_PARAMS, 'applicationId is required');
          }
          result = await this.deps.getApplicationUseCase.execute({
            applicationId: toStr(args.applicationId)!,
            userId,
          });
          break;
        case 'list_notes':
          if (!toStr(args.applicationId)) {
            return this.error(id, JSON_RPC_ERROR.INVALID_PARAMS, 'applicationId is required');
          }
          result = await this.deps.getNotesUseCase.execute({
            applicationId: toStr(args.applicationId)!,
            userId,
          });
          break;
        case 'list_contacts':
          if (!toStr(args.applicationId)) {
            return this.error(id, JSON_RPC_ERROR.INVALID_PARAMS, 'applicationId is required');
          }
          result = await this.deps.getContactsUseCase.execute({
            applicationId: toStr(args.applicationId)!,
            userId,
          });
          break;
        case 'list_interview_rounds':
          if (!toStr(args.applicationId)) {
            return this.error(id, JSON_RPC_ERROR.INVALID_PARAMS, 'applicationId is required');
          }
          result = await this.deps.getInterviewRoundsUseCase.execute({
            applicationId: toStr(args.applicationId)!,
            userId,
          });
          break;
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
            return this.error(id, JSON_RPC_ERROR.INVALID_PARAMS, 'applicationId is required');
          }
          result = await this.deps.getDocumentsUseCase.execute({
            applicationId: toStr(args.applicationId)!,
            userId,
          });
          break;
        case 'list_offers':
          if (!toStr(args.applicationId)) {
            return this.error(id, JSON_RPC_ERROR.INVALID_PARAMS, 'applicationId is required');
          }
          result = await this.deps.getOffersUseCase.execute({
            applicationId: toStr(args.applicationId)!,
            userId,
          });
          break;
        case 'list_activity':
          if (!toStr(args.applicationId)) {
            return this.error(id, JSON_RPC_ERROR.INVALID_PARAMS, 'applicationId is required');
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
        case 'create_application': {
          const company = toStr(args.company);
          const role = toStr(args.role);
          if (!company || !role) {
            return this.error(id, JSON_RPC_ERROR.INVALID_PARAMS, 'company and role are required');
          }
          result = await this.deps.createApplicationUseCase.execute({
            userId,
            company,
            role,
            status: toStr(args.status) as ApplicationStatus | undefined,
            jobUrl: toStr(args.jobUrl),
            location: toStr(args.location),
            salaryRange: toStr(args.salaryRange),
            description: toStr(args.description),
            source: toStr(args.source),
          });
          break;
        }
        case 'update_application': {
          const applicationId = toStr(args.applicationId);
          if (!applicationId) {
            return this.error(id, JSON_RPC_ERROR.INVALID_PARAMS, 'applicationId is required');
          }
          result = await this.deps.updateApplicationUseCase.execute({
            userId,
            applicationId,
            company: toStr(args.company),
            role: toStr(args.role),
            status: toStr(args.status) as ApplicationStatus | undefined,
            jobUrl: toStr(args.jobUrl),
            location: toStr(args.location),
            salaryRange: toStr(args.salaryRange),
            description: toStr(args.description),
            source: toStr(args.source),
          });
          break;
        }
        case 'create_note': {
          const applicationId = toStr(args.applicationId);
          const content = toStr(args.content);
          if (!applicationId || !content) {
            return this.error(
              id,
              JSON_RPC_ERROR.INVALID_PARAMS,
              'applicationId and content are required',
            );
          }
          result = await this.deps.createNoteUseCase.execute({ userId, applicationId, content });
          break;
        }
        case 'create_interview_round': {
          const applicationId = toStr(args.applicationId);
          if (!applicationId) {
            return this.error(id, JSON_RPC_ERROR.INVALID_PARAMS, 'applicationId is required');
          }
          result = await this.deps.createInterviewRoundUseCase.execute({
            userId,
            applicationId,
            type: toStr(args.type) as InterviewRoundType | undefined,
            scheduledAt: toDate(args.scheduledAt),
            interviewerName: toStr(args.interviewerName),
            notes: toStr(args.notes),
          });
          break;
        }
        case 'create_skill': {
          const name = toStr(args.name);
          if (!name) return this.error(id, JSON_RPC_ERROR.INVALID_PARAMS, 'name is required');
          result = await this.deps.createSkillUseCase.execute({
            userId,
            name,
            category: toStr(args.category),
            proficiency: toStr(args.proficiency),
          });
          break;
        }
        case 'update_skill': {
          const skillId = toStr(args.skillId);
          if (!skillId) return this.error(id, JSON_RPC_ERROR.INVALID_PARAMS, 'skillId is required');
          result = await this.deps.updateSkillUseCase.execute({
            id: skillId,
            userId,
            name: toStr(args.name),
            category: toStr(args.category),
            proficiency: toStr(args.proficiency),
          });
          break;
        }
        case 'create_education': {
          const institution = toStr(args.institution);
          // startDate is required by the use case, so an unparseable one has
          // to be refused rather than dropped — toDate() yields undefined for
          // junk, which would otherwise fail confusingly further down.
          const startDate = toDate(args.startDate);
          if (!institution || !startDate) {
            return this.error(
              id,
              JSON_RPC_ERROR.INVALID_PARAMS,
              'institution and a valid ISO 8601 startDate are required',
            );
          }
          result = await this.deps.createEducationUseCase.execute({
            userId,
            institution,
            startDate,
            degree: toStr(args.degree),
            field: toStr(args.field),
            endDate: toDate(args.endDate),
            description: toStr(args.description),
          });
          break;
        }
        case 'update_education': {
          const educationId = toStr(args.educationId);
          if (!educationId) {
            return this.error(id, JSON_RPC_ERROR.INVALID_PARAMS, 'educationId is required');
          }
          result = await this.deps.updateEducationUseCase.execute({
            id: educationId,
            userId,
            institution: toStr(args.institution),
            degree: toStr(args.degree),
            field: toStr(args.field),
            startDate: toDate(args.startDate),
            endDate: toDate(args.endDate),
            description: toStr(args.description),
          });
          break;
        }
        case 'create_work_experience': {
          const company = toStr(args.company);
          const title = toStr(args.title);
          const startDate = toDate(args.startDate);
          if (!company || !title || !startDate) {
            return this.error(
              id,
              JSON_RPC_ERROR.INVALID_PARAMS,
              'company, title and a valid ISO 8601 startDate are required',
            );
          }
          result = await this.deps.createWorkExperienceUseCase.execute({
            userId,
            company,
            title,
            startDate,
            location: toStr(args.location),
            endDate: toDate(args.endDate),
            description: toStr(args.description),
          });
          break;
        }
        case 'update_work_experience': {
          const workExperienceId = toStr(args.workExperienceId);
          if (!workExperienceId) {
            return this.error(id, JSON_RPC_ERROR.INVALID_PARAMS, 'workExperienceId is required');
          }
          result = await this.deps.updateWorkExperienceUseCase.execute({
            id: workExperienceId,
            userId,
            company: toStr(args.company),
            title: toStr(args.title),
            location: toStr(args.location),
            startDate: toDate(args.startDate),
            endDate: toDate(args.endDate),
            description: toStr(args.description),
          });
          break;
        }
        default:
          return this.error(id, JSON_RPC_ERROR.METHOD_NOT_FOUND, `Unknown tool: ${toolName}`);
      }

      return { jsonrpc: MCP.JSONRPC_VERSION, id, result: this.text(result) };
    } catch (err) {
      const code = (err as { code?: string }).code;
      const message = err instanceof Error ? err.message : 'Internal error';
      const isClientError = code === ERROR_CODES.NOT_FOUND || code === ERROR_CODES.FORBIDDEN;
      const rpcCode = isClientError ? JSON_RPC_ERROR.INVALID_PARAMS : JSON_RPC_ERROR.INTERNAL_ERROR;
      return this.error(id, rpcCode, message);
    }
  }

  private text(data: unknown) {
    // Compact, not pretty-printed: this goes straight into an LLM's context
    // window, where two-space indentation on every line of a page of results
    // is pure token cost with no reader to benefit from it.
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  }

  private error(id: McpRequest['id'], code: number, message: string) {
    return { jsonrpc: MCP.JSONRPC_VERSION, id, error: { code, message } };
  }
}
