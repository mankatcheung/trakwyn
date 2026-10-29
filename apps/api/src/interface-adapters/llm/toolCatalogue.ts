import { PAGINATION } from '#src/use-cases/constants.js';
import type { LLMToolDefinition } from '#src/use-cases/ports/ILLMProvider.js';
import type {
  InterviewRoundOutcome,
  InterviewRoundType,
} from '#src/domain/interviewRound/InterviewRound.js';
import type { OfferPeriod } from '#src/domain/offer/Offer.js';

/**
 * The values a tool argument may take where the domain has a closed set.
 * Advertised as JSON Schema `enum`s below and checked again by the MCP
 * handlers, since a client may send anything. `satisfies` keeps each list a
 * subset of its domain union.
 */
export const INTERVIEW_ROUND_TYPES = [
  'phone',
  'technical',
  'onsite',
  'hr',
  'other',
] as const satisfies readonly InterviewRoundType[];
export const INTERVIEW_ROUND_OUTCOMES = [
  'pending',
  'passed',
  'failed',
  'cancelled',
] as const satisfies readonly InterviewRoundOutcome[];
export const OFFER_PERIODS = [
  'yearly',
  'monthly',
  'weekly',
  'hourly',
] as const satisfies readonly OfferPeriod[];

/**
 * The single definition of every tool exposed to an LLM.
 *
 * This is a presentation contract — names, human-readable descriptions and
 * JSON Schema describing how capabilities are *described* to an external
 * consumer — so it sits in the adapter layer next to the other outward-facing
 * schemas, not in `use-cases/`.
 *
 * Nothing in `use-cases/` imports it. `StreamChatWithAssistantUseCase`
 * receives its tools as an injected `LLMToolDefinition[]` (see `toLlmToolDefinitions`
 * below and the `chatTools` registration in `http/di`), so the use case knows
 * only the port type and never the catalogue itself. Which surface exposes
 * which tools is therefore a composition decision, made once in the container
 * rather than inherited by whoever happens to import the list (JEF-177).
 *
 * `access` is internal metadata, not part of MCP's wire format: it drives
 * scope gating (a `read` token may not call a `write` tool) and the
 * per-surface selections below. Adapters strip it before advertising.
 * `destructive: true` marks a write that removes something from the user's
 * view (JEF-468); MCP advertises it as `destructiveHint` so a client can ask
 * before calling. Neither tag goes over the wire as-is.
 *
 * Descriptions deliberately don't restate that a write tool needs a
 * full-access token (JEF-178). Nobody it could inform ever reads it: a
 * read-only token never sees these tools, since `tools/list` filters them
 * out, and a full-access token can call them regardless. It was 340 bytes of
 * context spent on ten repetitions of something neither audience needed.
 */
export const TOOL_CATALOGUE = [
  {
    access: 'read',
    name: 'list_applications',
    description:
      'List job applications for the authenticated user, newest first. Returns one page; pass the returned nextCursor to fetch the next. Each row carries a short description preview — use get_application for the full text.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status (e.g. draft, applied, interviewing, offer, rejected)',
        },
        limit: {
          type: 'number',
          description: `Applications per page (1-${PAGINATION.MAX_LIMIT}, default ${PAGINATION.DEFAULT_LIMIT})`,
        },
        cursor: {
          type: 'string',
          description: 'nextCursor from a previous call, to fetch the following page',
        },
      },
    },
  },
  {
    access: 'read',
    name: 'get_application',
    description: 'Get a specific job application by ID',
    inputSchema: {
      type: 'object',
      properties: {
        applicationId: { type: 'string', description: 'The application ID' },
      },
      required: ['applicationId'],
    },
  },
  {
    access: 'read',
    name: 'list_notes',
    description: 'List notes for a job application',
    inputSchema: {
      type: 'object',
      properties: {
        applicationId: { type: 'string', description: 'The application ID' },
      },
      required: ['applicationId'],
    },
  },
  {
    access: 'read',
    name: 'list_contacts',
    description: 'List contacts associated with a job application',
    inputSchema: {
      type: 'object',
      properties: {
        applicationId: { type: 'string', description: 'The application ID' },
      },
      required: ['applicationId'],
    },
  },
  {
    access: 'read',
    name: 'list_interview_rounds',
    description: 'List interview rounds for a job application',
    inputSchema: {
      type: 'object',
      properties: {
        applicationId: { type: 'string', description: 'The application ID' },
      },
      required: ['applicationId'],
    },
  },
  {
    access: 'read',
    name: 'list_mock_interview_questions',
    description:
      "List the user's practice (mock) questions for an interview round, with any answer and whether the answer is AI generated. These are preparation, not what was asked in the interview.",
    inputSchema: {
      type: 'object',
      properties: {
        interviewRoundId: {
          type: 'string',
          description: 'The interview round ID (from list_interview_rounds)',
        },
      },
      required: ['interviewRoundId'],
    },
  },
  {
    access: 'read',
    name: 'generate_mock_interview_questions',
    description:
      'Suggest practice questions for an interview round, based on the job description and company briefing. Returns suggestions only and saves nothing; show them to the user and save the ones they pick with create_mock_interview_question.',
    inputSchema: {
      type: 'object',
      properties: {
        interviewRoundId: { type: 'string', description: 'The interview round ID' },
        prompt: { type: 'string', description: 'What the questions should focus on (optional)' },
        count: { type: 'number', description: 'How many to suggest, 1 to 10 (default 5)' },
      },
      required: ['interviewRoundId'],
    },
  },
  {
    access: 'read',
    name: 'generate_mock_interview_answer',
    description:
      'Draft an answer to one practice question, based on the job description and company briefing. Returns a draft only and saves nothing; if the user keeps it, save it with create_mock_interview_question using answerSource "ai".',
    inputSchema: {
      type: 'object',
      properties: {
        mockInterviewQuestionId: {
          type: 'string',
          description: 'The practice question ID (from list_mock_interview_questions)',
        },
        prompt: { type: 'string', description: 'How the answer should be shaped (optional)' },
      },
      required: ['mockInterviewQuestionId'],
    },
  },
  {
    access: 'read',
    name: 'list_work_experiences',
    description: 'List all work experiences for the authenticated user',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    access: 'read',
    name: 'list_educations',
    description: 'List all education entries for the authenticated user',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    access: 'read',
    name: 'list_skills',
    description: 'List all skills for the authenticated user',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    access: 'read',
    name: 'list_documents',
    description:
      'List documents (resumes, cover letters, offer letters) attached to a job application',
    inputSchema: {
      type: 'object',
      properties: {
        applicationId: { type: 'string', description: 'The application ID' },
      },
      required: ['applicationId'],
    },
  },
  {
    access: 'read',
    name: 'list_offers',
    description: 'List offers received for a job application, including compensation details',
    inputSchema: {
      type: 'object',
      properties: {
        applicationId: { type: 'string', description: 'The application ID' },
      },
      required: ['applicationId'],
    },
  },
  {
    access: 'read',
    name: 'list_activity',
    description:
      'List the activity/audit log for a job application — status changes and other events over time',
    inputSchema: {
      type: 'object',
      properties: {
        applicationId: { type: 'string', description: 'The application ID' },
      },
      required: ['applicationId'],
    },
  },
  {
    access: 'read',
    name: 'list_calendar_events',
    description:
      'List upcoming and past calendar events for the authenticated user — scheduled interviews and application follow-up dates',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    access: 'read',
    name: 'get_analytics',
    description:
      'Aggregate job-search statistics for the authenticated user: response times, which application channels perform best, interview-round progression, and offer figures. Use this for questions like "how is my search going?" — it returns compact summaries rather than raw records.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    access: 'write',
    name: 'create_application',
    description: 'Create a new job application.',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company name' },
        role: { type: 'string', description: 'Job title / role' },
        status: {
          type: 'string',
          description: 'Initial status (draft, applied, interviewing, offer, rejected)',
        },
        jobUrl: { type: 'string', description: 'Link to the job posting' },
        location: { type: 'string' },
        salaryRange: { type: 'string' },
        description: { type: 'string', description: 'Job description or notes' },
        source: { type: 'string', description: 'Where the role was found, e.g. LinkedIn' },
      },
      required: ['company', 'role'],
    },
  },
  {
    access: 'write',
    name: 'update_application',
    description:
      'Update fields on an existing job application. Only the fields provided are changed.',
    inputSchema: {
      type: 'object',
      properties: {
        applicationId: { type: 'string', description: 'The application ID' },
        company: { type: 'string' },
        role: { type: 'string' },
        status: {
          type: 'string',
          description: 'New status (draft, applied, interviewing, offer, rejected)',
        },
        jobUrl: { type: 'string' },
        location: { type: 'string' },
        salaryRange: { type: 'string' },
        description: { type: 'string' },
        source: { type: 'string' },
      },
      required: ['applicationId'],
    },
  },
  {
    access: 'write',
    destructive: true,
    name: 'trash_application',
    description:
      'Move a job application to Trash. It disappears from every list and tool at once, and the user can restore it from Trash in the web app for 30 days, after which it is deleted for good. Confirm with the user first.',
    inputSchema: {
      type: 'object',
      properties: {
        applicationId: { type: 'string', description: 'The application ID' },
      },
      required: ['applicationId'],
    },
  },
  {
    access: 'write',
    name: 'create_note',
    description: 'Add a note to a job application.',
    inputSchema: {
      type: 'object',
      properties: {
        applicationId: { type: 'string', description: 'The application ID' },
        content: { type: 'string', description: 'Note text' },
      },
      required: ['applicationId', 'content'],
    },
  },
  {
    access: 'write',
    name: 'update_note',
    description: "Replace a note's text.",
    inputSchema: {
      type: 'object',
      properties: {
        noteId: { type: 'string', description: 'The note ID (from list_notes)' },
        content: { type: 'string', description: 'The new note text' },
      },
      required: ['noteId', 'content'],
    },
  },
  {
    access: 'write',
    name: 'create_contact',
    description: 'Add a contact (recruiter, interviewer, referrer) to a job application.',
    inputSchema: {
      type: 'object',
      properties: {
        applicationId: { type: 'string', description: 'The application ID' },
        name: { type: 'string', description: "The contact's name" },
        role: { type: 'string', description: 'e.g. Recruiter, Hiring manager' },
        email: { type: 'string' },
        phone: { type: 'string' },
        linkedinUrl: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['applicationId', 'name'],
    },
  },
  {
    access: 'write',
    name: 'update_contact',
    description: 'Update an existing contact. Only the fields provided are changed.',
    inputSchema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID (from list_contacts)' },
        name: { type: 'string' },
        role: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        linkedinUrl: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['contactId'],
    },
  },
  {
    access: 'write',
    name: 'create_interview_round',
    description: 'Record an interview round for a job application.',
    inputSchema: {
      type: 'object',
      properties: {
        applicationId: { type: 'string', description: 'The application ID' },
        type: { type: 'string', enum: INTERVIEW_ROUND_TYPES, description: 'Round type' },
        scheduledAt: { type: 'string', description: 'ISO 8601 date-time the round is scheduled' },
        interviewerName: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['applicationId'],
    },
  },
  {
    access: 'write',
    name: 'update_interview_round',
    description:
      'Update an existing interview round, e.g. reschedule it or record how it went. Only the fields provided are changed.',
    inputSchema: {
      type: 'object',
      properties: {
        interviewRoundId: {
          type: 'string',
          description: 'The interview round ID (from list_interview_rounds)',
        },
        type: { type: 'string', enum: INTERVIEW_ROUND_TYPES },
        scheduledAt: { type: 'string', description: 'ISO 8601 date-time' },
        completedAt: { type: 'string', description: 'ISO 8601 date-time the round took place' },
        interviewerName: { type: 'string' },
        notes: { type: 'string' },
        outcome: { type: 'string', enum: INTERVIEW_ROUND_OUTCOMES },
      },
      required: ['interviewRoundId'],
    },
  },
  {
    access: 'write',
    name: 'create_offer',
    description: 'Record an offer received for a job application.',
    inputSchema: {
      type: 'object',
      properties: {
        applicationId: { type: 'string', description: 'The application ID' },
        baseSalary: { type: 'number', description: 'Base pay per period, as a plain number' },
        currency: { type: 'string', description: 'ISO 4217 code, e.g. USD (default USD)' },
        period: {
          type: 'string',
          enum: OFFER_PERIODS,
          description: 'What baseSalary is paid per (default yearly)',
        },
        bonus: { type: 'number' },
        equity: { type: 'string', description: 'e.g. 0.1% over 4 years' },
        benefits: { type: 'string' },
        costOfLivingAdjustment: { type: 'number' },
        notes: { type: 'string' },
      },
      required: ['applicationId', 'baseSalary'],
    },
  },
  {
    access: 'write',
    name: 'update_offer',
    description: 'Update an existing offer. Only the fields provided are changed.',
    inputSchema: {
      type: 'object',
      properties: {
        offerId: { type: 'string', description: 'The offer ID (from list_offers)' },
        baseSalary: { type: 'number' },
        currency: { type: 'string' },
        period: { type: 'string', enum: OFFER_PERIODS },
        bonus: { type: 'number' },
        equity: { type: 'string' },
        benefits: { type: 'string' },
        costOfLivingAdjustment: { type: 'number' },
        notes: { type: 'string' },
      },
      required: ['offerId'],
    },
  },
  {
    access: 'write',
    name: 'create_mock_interview_question',
    description:
      'Save a practice question, and optionally an answer, to an interview round. Practice questions are kept apart from the questions actually asked in the interview.',
    inputSchema: {
      type: 'object',
      properties: {
        interviewRoundId: { type: 'string', description: 'The interview round ID' },
        question: { type: 'string', description: 'The practice question' },
        answer: { type: 'string', description: 'The answer (optional)' },
        answerSource: {
          type: 'string',
          enum: ['user', 'ai'],
          description:
            'Use "ai" when the answer came from generate_mock_interview_answer; otherwise "user" (the default)',
        },
      },
      required: ['interviewRoundId', 'question'],
    },
  },
  {
    access: 'write',
    name: 'create_skill',
    description: 'Add a skill to the user profile.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill name, e.g. TypeScript' },
        category: { type: 'string', description: 'Grouping, e.g. Languages' },
        proficiency: { type: 'string', description: 'e.g. beginner, intermediate, expert' },
      },
      required: ['name'],
    },
  },
  {
    access: 'write',
    name: 'update_skill',
    description: 'Update an existing skill. Only the fields provided are changed.',
    inputSchema: {
      type: 'object',
      properties: {
        skillId: { type: 'string', description: 'The skill ID (from list_skills)' },
        name: { type: 'string' },
        category: { type: 'string' },
        proficiency: { type: 'string' },
      },
      required: ['skillId'],
    },
  },
  {
    access: 'write',
    name: 'create_education',
    description: 'Add an education entry to the user profile.',
    inputSchema: {
      type: 'object',
      properties: {
        institution: { type: 'string', description: 'School or university name' },
        startDate: { type: 'string', description: 'ISO 8601 date the study began (required)' },
        degree: { type: 'string' },
        field: { type: 'string', description: 'Field of study' },
        endDate: { type: 'string', description: 'ISO 8601 date; omit if ongoing' },
        description: { type: 'string' },
      },
      required: ['institution', 'startDate'],
    },
  },
  {
    access: 'write',
    name: 'update_education',
    description: 'Update an existing education entry. Only the fields provided are changed.',
    inputSchema: {
      type: 'object',
      properties: {
        educationId: { type: 'string', description: 'The education ID (from list_educations)' },
        institution: { type: 'string' },
        degree: { type: 'string' },
        field: { type: 'string' },
        startDate: { type: 'string', description: 'ISO 8601 date' },
        endDate: { type: 'string', description: 'ISO 8601 date' },
        description: { type: 'string' },
      },
      required: ['educationId'],
    },
  },
  {
    access: 'write',
    name: 'create_work_experience',
    description: 'Add a work experience entry to the user profile.',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string' },
        title: { type: 'string', description: 'Job title' },
        startDate: { type: 'string', description: 'ISO 8601 date the role began (required)' },
        location: { type: 'string' },
        endDate: { type: 'string', description: 'ISO 8601 date; omit if current' },
        description: { type: 'string' },
      },
      required: ['company', 'title', 'startDate'],
    },
  },
  {
    access: 'write',
    name: 'update_work_experience',
    description: 'Update an existing work experience entry. Only the fields provided are changed.',
    inputSchema: {
      type: 'object',
      properties: {
        workExperienceId: {
          type: 'string',
          description: 'The work experience ID (from list_work_experiences)',
        },
        company: { type: 'string' },
        title: { type: 'string' },
        location: { type: 'string' },
        startDate: { type: 'string', description: 'ISO 8601 date' },
        endDate: { type: 'string', description: 'ISO 8601 date' },
        description: { type: 'string' },
      },
      required: ['workExperienceId'],
    },
  },
] as const;

/** A single entry in {@link TOOL_CATALOGUE}. */
export type ToolDefinition = (typeof TOOL_CATALOGUE)[number];

/** Whether a tool reads or mutates. */
export type ToolAccess = ToolDefinition['access'];

/** The name of every tool a `read` token may not call. */
export type WriteToolName = Extract<ToolDefinition, { access: 'write' }>['name'];

/** Whether a tool is tagged `destructive` (only some entries carry the tag). */
export function isDestructive(tool: ToolDefinition): boolean {
  return 'destructive' in tool && tool.destructive;
}

/**
 * What the MCP server exposes: everything. Write tools are gated per
 * request by token scope rather than withheld from the catalogue, so a
 * full-access token sees them and a read-only one does not.
 */
export const MCP_TOOLS = TOOL_CATALOGUE;

/**
 * What the in-app chat assistant exposes (JEF-469): every read, plus every
 * write that is not `destructive`.
 *
 * Chat is session-authenticated and has no token scope to gate on, so a write
 * the model asks for is never run on the spot: it becomes a proposal the user
 * confirms (`ChatWriteTools`, `chatAssembly.executeChatTool`). Deletes are not
 * offered at all, however they would be confirmed. Declared here rather than
 * filtered at the call site so the two surfaces' selections sit side by side
 * and diverging is a visible edit.
 */
export const CHAT_TOOLS = TOOL_CATALOGUE.filter((t) => t.access === 'read' || !isDestructive(t));

/** The writes in {@link CHAT_TOOLS}: the ones chat can propose. */
export const CHAT_WRITE_TOOLS = CHAT_TOOLS.filter(
  (t): t is Extract<ToolDefinition, { access: 'write' }> => t.access === 'write',
);

/**
 * Adapts catalogue entries to the shape an LLM provider expects, dropping
 * the internal `access` tag on the way out.
 *
 * The cache breakpoint goes on the final tool so providers that support
 * prompt caching can reuse the whole tools block across turns; it belongs
 * here rather than in the catalogue because it's a provider concern, not a
 * property of the tool.
 */
export function toLlmToolDefinitions(tools: readonly ToolDefinition[]): LLMToolDefinition[] {
  return tools.map((t, i, arr) => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
    ...(i === arr.length - 1 ? { cacheBreakpoint: true } : {}),
  }));
}
