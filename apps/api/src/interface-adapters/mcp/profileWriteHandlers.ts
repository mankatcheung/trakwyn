import type { ICreateCertificationUseCase } from '#src/use-cases/certification/ICreateCertificationUseCase.js';
import type { IUpdateCertificationUseCase } from '#src/use-cases/certification/IUpdateCertificationUseCase.js';
import type { ICreateLanguageUseCase } from '#src/use-cases/language/ICreateLanguageUseCase.js';
import type { IUpdateLanguageUseCase } from '#src/use-cases/language/IUpdateLanguageUseCase.js';
import type { ICreateProjectUseCase } from '#src/use-cases/project/ICreateProjectUseCase.js';
import type { IUpdateProjectUseCase } from '#src/use-cases/project/IUpdateProjectUseCase.js';
import type { ICreateAwardUseCase } from '#src/use-cases/award/ICreateAwardUseCase.js';
import type { IUpdateAwardUseCase } from '#src/use-cases/award/IUpdateAwardUseCase.js';
import type { PROFILE_WRITE_TOOLS } from '#src/interface-adapters/llm/profileToolDefinitions.js';
import { toDate, toStr, type ToolArgs } from '#src/interface-adapters/mcp/toolArgs.js';

/** The use cases behind the profile write tools (certifications, languages, projects, awards). */
export interface ProfileWriteToolDeps {
  createCertificationUseCase: ICreateCertificationUseCase;
  updateCertificationUseCase: IUpdateCertificationUseCase;
  createLanguageUseCase: ICreateLanguageUseCase;
  updateLanguageUseCase: IUpdateLanguageUseCase;
  createProjectUseCase: ICreateProjectUseCase;
  updateProjectUseCase: IUpdateProjectUseCase;
  createAwardUseCase: ICreateAwardUseCase;
  updateAwardUseCase: IUpdateAwardUseCase;
}

type ProfileWriteToolName = (typeof PROFILE_WRITE_TOOLS)[number]['name'];
type ProfileWriteOutcome = { result: unknown } | { invalid: string };

type ProfileWriteHandler = (
  args: ToolArgs,
  userId: string,
  deps: ProfileWriteToolDeps,
) => Promise<ProfileWriteOutcome>;

const invalid = (message: string): ProfileWriteOutcome => ({ invalid: message });

/**
 * Handlers for the profile write tools, spread into `WRITE_TOOL_HANDLERS`.
 * Same shape as the skill and education handlers: required arguments are
 * checked here, ownership by the use case.
 */
export const PROFILE_WRITE_HANDLERS: Record<ProfileWriteToolName, ProfileWriteHandler> = {
  async create_certification(args, userId, deps) {
    const name = toStr(args.name);
    if (!name) return invalid('name is required');
    return {
      result: await deps.createCertificationUseCase.execute({
        userId,
        name,
        issuer: toStr(args.issuer),
        issuedAt: toDate(args.issuedAt),
        expiresAt: toDate(args.expiresAt),
        credentialUrl: toStr(args.credentialUrl),
      }),
    };
  },

  async update_certification(args, userId, deps) {
    const certificationId = toStr(args.certificationId);
    if (!certificationId) return invalid('certificationId is required');
    return {
      result: await deps.updateCertificationUseCase.execute({
        id: certificationId,
        userId,
        name: toStr(args.name),
        issuer: toStr(args.issuer),
        issuedAt: toDate(args.issuedAt),
        expiresAt: toDate(args.expiresAt),
        credentialUrl: toStr(args.credentialUrl),
      }),
    };
  },

  async create_language(args, userId, deps) {
    const name = toStr(args.name);
    if (!name) return invalid('name is required');
    return {
      result: await deps.createLanguageUseCase.execute({
        userId,
        name,
        proficiency: toStr(args.proficiency),
      }),
    };
  },

  async update_language(args, userId, deps) {
    const languageId = toStr(args.languageId);
    if (!languageId) return invalid('languageId is required');
    return {
      result: await deps.updateLanguageUseCase.execute({
        id: languageId,
        userId,
        name: toStr(args.name),
        proficiency: toStr(args.proficiency),
      }),
    };
  },

  async create_project(args, userId, deps) {
    const name = toStr(args.name);
    if (!name) return invalid('name is required');
    return {
      result: await deps.createProjectUseCase.execute({
        userId,
        name,
        role: toStr(args.role),
        url: toStr(args.url),
        startDate: toDate(args.startDate),
        endDate: toDate(args.endDate),
        description: toStr(args.description),
      }),
    };
  },

  async update_project(args, userId, deps) {
    const projectId = toStr(args.projectId);
    if (!projectId) return invalid('projectId is required');
    return {
      result: await deps.updateProjectUseCase.execute({
        id: projectId,
        userId,
        name: toStr(args.name),
        role: toStr(args.role),
        url: toStr(args.url),
        startDate: toDate(args.startDate),
        endDate: toDate(args.endDate),
        description: toStr(args.description),
      }),
    };
  },

  async create_award(args, userId, deps) {
    const title = toStr(args.title);
    if (!title) return invalid('title is required');
    return {
      result: await deps.createAwardUseCase.execute({
        userId,
        title,
        issuer: toStr(args.issuer),
        date: toDate(args.date),
        description: toStr(args.description),
      }),
    };
  },

  async update_award(args, userId, deps) {
    const awardId = toStr(args.awardId);
    if (!awardId) return invalid('awardId is required');
    return {
      result: await deps.updateAwardUseCase.execute({
        id: awardId,
        userId,
        title: toStr(args.title),
        issuer: toStr(args.issuer),
        date: toDate(args.date),
        description: toStr(args.description),
      }),
    };
  },
};
