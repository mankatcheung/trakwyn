import { PAGINATION } from '#src/use-cases/constants.js';
import type { LLMToolDefinition } from '#src/use-cases/ports/ILLMProvider.js';

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
    name: 'create_interview_round',
    description: 'Record an interview round for a job application.',
    inputSchema: {
      type: 'object',
      properties: {
        applicationId: { type: 'string', description: 'The application ID' },
        type: {
          type: 'string',
          description: 'Round type, e.g. phone_screen, technical, onsite, final',
        },
        scheduledAt: { type: 'string', description: 'ISO 8601 date-time the round is scheduled' },
        interviewerName: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['applicationId'],
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

/**
 * What the MCP server exposes: everything. Write tools are gated per
 * request by token scope rather than withheld from the catalogue, so a
 * full-access token sees them and a read-only one does not.
 */
export const MCP_TOOLS = TOOL_CATALOGUE;

/**
 * What the in-app chat assistant exposes: reads only.
 *
 * Chat is session-authenticated and has no token scope to gate on, so it
 * cannot safely offer write tools — a user talking to the assistant has
 * not opted into letting it mutate their data the way someone minting a
 * full-access token has. Declared here rather than filtered at the call
 * site so the two surfaces' selections sit side by side and diverging is
 * a visible edit.
 */
export const CHAT_TOOLS = TOOL_CATALOGUE.filter((t) => t.access === 'read');

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
