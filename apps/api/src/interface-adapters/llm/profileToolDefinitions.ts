/**
 * The catalogue entries for the profile sections added in JEF-592
 * (certifications, languages, projects, awards), spread into
 * `TOOL_CATALOGUE`. They sit in their own file so the catalogue stays a
 * table of the older tools; the schemas mirror the GraphQL inputs.
 *
 * No delete tool is declared: chat never offers one, and MCP has no hard
 * deletes for profile entries (see `mcp/CLAUDE.md`).
 */

const NO_ARGS = { type: 'object', properties: {} } as const;

export const PROFILE_READ_TOOLS = [
  {
    access: 'read',
    name: 'list_certifications',
    description: 'List all certifications for the authenticated user',
    inputSchema: NO_ARGS,
  },
  {
    access: 'read',
    name: 'list_languages',
    description: 'List all spoken languages for the authenticated user',
    inputSchema: NO_ARGS,
  },
  {
    access: 'read',
    name: 'list_projects',
    description: 'List all projects for the authenticated user',
    inputSchema: NO_ARGS,
  },
  {
    access: 'read',
    name: 'list_awards',
    description: 'List all awards for the authenticated user',
    inputSchema: NO_ARGS,
  },
] as const;

export const PROFILE_WRITE_TOOLS = [
  {
    access: 'write',
    name: 'create_certification',
    description: 'Add a certification to the user profile.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Certification name, e.g. AWS Solutions Architect' },
        issuer: { type: 'string', description: 'Issuing organisation, e.g. Amazon Web Services' },
        issuedAt: { type: 'string', description: 'ISO 8601 date it was issued' },
        expiresAt: { type: 'string', description: 'ISO 8601 date; omit if it does not expire' },
        credentialUrl: { type: 'string', description: 'Link to verify the credential' },
      },
      required: ['name'],
    },
  },
  {
    access: 'write',
    name: 'update_certification',
    description: 'Update an existing certification. Only the fields provided are changed.',
    inputSchema: {
      type: 'object',
      properties: {
        certificationId: {
          type: 'string',
          description: 'The certification ID (from list_certifications)',
        },
        name: { type: 'string' },
        issuer: { type: 'string' },
        issuedAt: { type: 'string', description: 'ISO 8601 date' },
        expiresAt: { type: 'string', description: 'ISO 8601 date' },
        credentialUrl: { type: 'string' },
      },
      required: ['certificationId'],
    },
  },
  {
    access: 'write',
    name: 'create_language',
    description: 'Add a spoken language to the user profile.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Language, e.g. Spanish' },
        proficiency: { type: 'string', description: 'e.g. native, fluent, conversational' },
      },
      required: ['name'],
    },
  },
  {
    access: 'write',
    name: 'update_language',
    description: 'Update an existing language. Only the fields provided are changed.',
    inputSchema: {
      type: 'object',
      properties: {
        languageId: { type: 'string', description: 'The language ID (from list_languages)' },
        name: { type: 'string' },
        proficiency: { type: 'string' },
      },
      required: ['languageId'],
    },
  },
  {
    access: 'write',
    name: 'create_project',
    description: 'Add a project to the user profile.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name' },
        role: { type: 'string', description: "The user's role on the project" },
        url: { type: 'string', description: 'Link to the project' },
        startDate: { type: 'string', description: 'ISO 8601 date the project began' },
        endDate: { type: 'string', description: 'ISO 8601 date; omit if ongoing' },
        description: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    access: 'write',
    name: 'update_project',
    description: 'Update an existing project. Only the fields provided are changed.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'The project ID (from list_projects)' },
        name: { type: 'string' },
        role: { type: 'string' },
        url: { type: 'string' },
        startDate: { type: 'string', description: 'ISO 8601 date' },
        endDate: { type: 'string', description: 'ISO 8601 date' },
        description: { type: 'string' },
      },
      required: ['projectId'],
    },
  },
  {
    access: 'write',
    name: 'create_award',
    description: 'Add an award to the user profile.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Award title' },
        issuer: { type: 'string', description: 'Who gave the award' },
        date: { type: 'string', description: 'ISO 8601 date it was received' },
        description: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    access: 'write',
    name: 'update_award',
    description: 'Update an existing award. Only the fields provided are changed.',
    inputSchema: {
      type: 'object',
      properties: {
        awardId: { type: 'string', description: 'The award ID (from list_awards)' },
        title: { type: 'string' },
        issuer: { type: 'string' },
        date: { type: 'string', description: 'ISO 8601 date' },
        description: { type: 'string' },
      },
      required: ['awardId'],
    },
  },
] as const;
