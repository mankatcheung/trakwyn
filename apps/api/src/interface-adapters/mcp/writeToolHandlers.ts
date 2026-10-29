import type { ApplicationStatus } from '#src/domain/application/ApplicationStatus.js';
import type { ICreateApplicationUseCase } from '#src/use-cases/jobs/ICreateApplicationUseCase.js';
import type { IUpdateApplicationUseCase } from '#src/use-cases/jobs/IUpdateApplicationUseCase.js';
import type { IDeleteApplicationUseCase } from '#src/use-cases/jobs/IDeleteApplicationUseCase.js';
import type { ICreateNoteUseCase } from '#src/use-cases/notes/ICreateNoteUseCase.js';
import type { IUpdateNoteUseCase } from '#src/use-cases/notes/IUpdateNoteUseCase.js';
import type { ICreateContactUseCase } from '#src/use-cases/contacts/ICreateContactUseCase.js';
import type { IUpdateContactUseCase } from '#src/use-cases/contacts/IUpdateContactUseCase.js';
import type { ICreateInterviewRoundUseCase } from '#src/use-cases/interviewRounds/ICreateInterviewRoundUseCase.js';
import type { IUpdateInterviewRoundUseCase } from '#src/use-cases/interviewRounds/IUpdateInterviewRoundUseCase.js';
import type { ICreateOfferUseCase } from '#src/use-cases/offers/ICreateOfferUseCase.js';
import type { IUpdateOfferUseCase } from '#src/use-cases/offers/IUpdateOfferUseCase.js';
import type { ICreateMockInterviewQuestionUseCase } from '#src/use-cases/mockInterviewQuestions/ICreateMockInterviewQuestionUseCase.js';
import type { ICreateSkillUseCase } from '#src/use-cases/skill/ICreateSkillUseCase.js';
import type { IUpdateSkillUseCase } from '#src/use-cases/skill/IUpdateSkillUseCase.js';
import type { ICreateEducationUseCase } from '#src/use-cases/education/ICreateEducationUseCase.js';
import type { IUpdateEducationUseCase } from '#src/use-cases/education/IUpdateEducationUseCase.js';
import type { ICreateWorkExperienceUseCase } from '#src/use-cases/workExperience/ICreateWorkExperienceUseCase.js';
import type { IUpdateWorkExperienceUseCase } from '#src/use-cases/workExperience/IUpdateWorkExperienceUseCase.js';
import type { McpActor } from '#src/use-cases/shared/mcpActor.js';
import {
  INTERVIEW_ROUND_OUTCOMES,
  INTERVIEW_ROUND_TYPES,
  OFFER_PERIODS,
  type WriteToolName,
} from '#src/interface-adapters/llm/toolCatalogue.js';
import {
  toAmount,
  toDate,
  toOneOf,
  toStr,
  type ToolArgs,
} from '#src/interface-adapters/mcp/toolArgs.js';

/** The use cases behind the write tools; resolved from the Cradle by name. */
export interface WriteToolDeps {
  createApplicationUseCase: ICreateApplicationUseCase;
  updateApplicationUseCase: IUpdateApplicationUseCase;
  deleteApplicationUseCase: IDeleteApplicationUseCase;
  createNoteUseCase: ICreateNoteUseCase;
  updateNoteUseCase: IUpdateNoteUseCase;
  createContactUseCase: ICreateContactUseCase;
  updateContactUseCase: IUpdateContactUseCase;
  createInterviewRoundUseCase: ICreateInterviewRoundUseCase;
  updateInterviewRoundUseCase: IUpdateInterviewRoundUseCase;
  createOfferUseCase: ICreateOfferUseCase;
  updateOfferUseCase: IUpdateOfferUseCase;
  createMockInterviewQuestionUseCase: ICreateMockInterviewQuestionUseCase;
  createSkillUseCase: ICreateSkillUseCase;
  updateSkillUseCase: IUpdateSkillUseCase;
  createEducationUseCase: ICreateEducationUseCase;
  updateEducationUseCase: IUpdateEducationUseCase;
  createWorkExperienceUseCase: ICreateWorkExperienceUseCase;
  updateWorkExperienceUseCase: IUpdateWorkExperienceUseCase;
}

/** What a handler hands back: the value to serialise, or an argument check that failed. */
export type WriteToolOutcome = { result: unknown } | { invalid: string };

type WriteToolHandler = (
  args: ToolArgs,
  userId: string,
  deps: WriteToolDeps,
  actor?: McpActor,
) => Promise<WriteToolOutcome>;

const invalid = (message: string): WriteToolOutcome => ({ invalid: message });

/**
 * One handler per write tool, keyed by the catalogue's own write-tool names,
 * so a write tool added to TOOL_CATALOGUE without a handler here (or a
 * handler for a name that is not a write tool) fails typecheck rather than
 * answering "Unknown tool" at call time. The controller has already checked
 * the token's scope before any of these runs.
 *
 * Each handler passes the caller's `userId` and nothing else identifying; the
 * use case owns the ownership check, so a record id from another account is
 * refused there, not written.
 */
export const WRITE_TOOL_HANDLERS: Record<WriteToolName, WriteToolHandler> = {
  async create_application(args, userId, deps) {
    const company = toStr(args.company);
    const role = toStr(args.role);
    if (!company || !role) return invalid('company and role are required');
    return {
      result: await deps.createApplicationUseCase.execute({
        userId,
        company,
        role,
        status: toStr(args.status) as ApplicationStatus | undefined,
        jobUrl: toStr(args.jobUrl),
        location: toStr(args.location),
        salaryRange: toStr(args.salaryRange),
        description: toStr(args.description),
        source: toStr(args.source),
      }),
    };
  },

  async update_application(args, userId, deps, actor) {
    const applicationId = toStr(args.applicationId);
    if (!applicationId) return invalid('applicationId is required');
    return {
      result: await deps.updateApplicationUseCase.execute({
        userId,
        applicationId,
        actor,
        company: toStr(args.company),
        role: toStr(args.role),
        status: toStr(args.status) as ApplicationStatus | undefined,
        jobUrl: toStr(args.jobUrl),
        location: toStr(args.location),
        salaryRange: toStr(args.salaryRange),
        description: toStr(args.description),
        source: toStr(args.source),
      }),
    };
  },

  async trash_application(args, userId, deps) {
    const applicationId = toStr(args.applicationId);
    if (!applicationId) return invalid('applicationId is required');
    // A soft delete: the row and its children stay, and the web app's Trash
    // can restore it for thirty days. The use case returns nothing, so the
    // result says what happened rather than serialising `undefined`.
    await deps.deleteApplicationUseCase.execute({ userId, applicationId });
    return { result: { applicationId, trashed: true } };
  },

  async create_note(args, userId, deps, actor) {
    const applicationId = toStr(args.applicationId);
    const content = toStr(args.content);
    if (!applicationId || !content) return invalid('applicationId and content are required');
    return {
      result: await deps.createNoteUseCase.execute({ userId, applicationId, content, actor }),
    };
  },

  async update_note(args, userId, deps) {
    const noteId = toStr(args.noteId);
    const content = toStr(args.content);
    if (!noteId || !content) return invalid('noteId and content are required');
    return { result: await deps.updateNoteUseCase.execute({ userId, noteId, content }) };
  },

  async create_contact(args, userId, deps) {
    const applicationId = toStr(args.applicationId);
    const name = toStr(args.name);
    if (!applicationId || !name) return invalid('applicationId and name are required');
    return {
      result: await deps.createContactUseCase.execute({
        userId,
        applicationId,
        name,
        role: toStr(args.role),
        email: toStr(args.email),
        phone: toStr(args.phone),
        linkedinUrl: toStr(args.linkedinUrl),
        notes: toStr(args.notes),
      }),
    };
  },

  async update_contact(args, userId, deps) {
    const contactId = toStr(args.contactId);
    if (!contactId) return invalid('contactId is required');
    return {
      result: await deps.updateContactUseCase.execute({
        userId,
        contactId,
        name: toStr(args.name),
        role: toStr(args.role),
        email: toStr(args.email),
        phone: toStr(args.phone),
        linkedinUrl: toStr(args.linkedinUrl),
        notes: toStr(args.notes),
      }),
    };
  },

  async create_interview_round(args, userId, deps, actor) {
    const applicationId = toStr(args.applicationId);
    if (!applicationId) return invalid('applicationId is required');
    return {
      result: await deps.createInterviewRoundUseCase.execute({
        userId,
        applicationId,
        actor,
        type: toOneOf(args.type, INTERVIEW_ROUND_TYPES),
        scheduledAt: toDate(args.scheduledAt),
        interviewerName: toStr(args.interviewerName),
        notes: toStr(args.notes),
      }),
    };
  },

  async update_interview_round(args, userId, deps) {
    const interviewRoundId = toStr(args.interviewRoundId);
    if (!interviewRoundId) return invalid('interviewRoundId is required');
    return {
      result: await deps.updateInterviewRoundUseCase.execute({
        userId,
        roundId: interviewRoundId,
        type: toOneOf(args.type, INTERVIEW_ROUND_TYPES),
        scheduledAt: toDate(args.scheduledAt),
        completedAt: toDate(args.completedAt),
        interviewerName: toStr(args.interviewerName),
        notes: toStr(args.notes),
        outcome: toOneOf(args.outcome, INTERVIEW_ROUND_OUTCOMES),
      }),
    };
  },

  async create_offer(args, userId, deps) {
    const applicationId = toStr(args.applicationId);
    const baseSalary = toAmount(args.baseSalary);
    if (!applicationId || baseSalary === undefined) {
      return invalid('applicationId and a non-negative baseSalary are required');
    }
    return {
      result: await deps.createOfferUseCase.execute({
        userId,
        applicationId,
        baseSalary,
        bonus: toAmount(args.bonus),
        equity: toStr(args.equity),
        benefits: toStr(args.benefits),
        costOfLivingAdjustment: toAmount(args.costOfLivingAdjustment),
        currency: toStr(args.currency),
        period: toOneOf(args.period, OFFER_PERIODS),
        notes: toStr(args.notes),
      }),
    };
  },

  async update_offer(args, userId, deps) {
    const offerId = toStr(args.offerId);
    if (!offerId) return invalid('offerId is required');
    return {
      result: await deps.updateOfferUseCase.execute({
        userId,
        offerId,
        baseSalary: toAmount(args.baseSalary),
        bonus: toAmount(args.bonus),
        equity: toStr(args.equity),
        benefits: toStr(args.benefits),
        costOfLivingAdjustment: toAmount(args.costOfLivingAdjustment),
        currency: toStr(args.currency),
        period: toOneOf(args.period, OFFER_PERIODS),
        notes: toStr(args.notes),
      }),
    };
  },

  async create_mock_interview_question(args, userId, deps) {
    const interviewRoundId = toStr(args.interviewRoundId);
    const question = toStr(args.question);
    if (!interviewRoundId || !question) {
      return invalid('interviewRoundId and question are required');
    }
    return {
      result: await deps.createMockInterviewQuestionUseCase.execute({
        userId,
        roundId: interviewRoundId,
        question,
        answer: toStr(args.answer),
        answerSource: args.answerSource === 'ai' ? 'ai' : 'user',
      }),
    };
  },

  async create_skill(args, userId, deps) {
    const name = toStr(args.name);
    if (!name) return invalid('name is required');
    return {
      result: await deps.createSkillUseCase.execute({
        userId,
        name,
        category: toStr(args.category),
        proficiency: toStr(args.proficiency),
      }),
    };
  },

  async update_skill(args, userId, deps) {
    const skillId = toStr(args.skillId);
    if (!skillId) return invalid('skillId is required');
    return {
      result: await deps.updateSkillUseCase.execute({
        id: skillId,
        userId,
        name: toStr(args.name),
        category: toStr(args.category),
        proficiency: toStr(args.proficiency),
      }),
    };
  },

  async create_education(args, userId, deps) {
    const institution = toStr(args.institution);
    // startDate is required by the use case, so an unparseable one has to be
    // refused rather than dropped — toDate() yields undefined for junk, which
    // would otherwise fail confusingly further down.
    const startDate = toDate(args.startDate);
    if (!institution || !startDate) {
      return invalid('institution and a valid ISO 8601 startDate are required');
    }
    return {
      result: await deps.createEducationUseCase.execute({
        userId,
        institution,
        startDate,
        degree: toStr(args.degree),
        field: toStr(args.field),
        endDate: toDate(args.endDate),
        description: toStr(args.description),
      }),
    };
  },

  async update_education(args, userId, deps) {
    const educationId = toStr(args.educationId);
    if (!educationId) return invalid('educationId is required');
    return {
      result: await deps.updateEducationUseCase.execute({
        id: educationId,
        userId,
        institution: toStr(args.institution),
        degree: toStr(args.degree),
        field: toStr(args.field),
        startDate: toDate(args.startDate),
        endDate: toDate(args.endDate),
        description: toStr(args.description),
      }),
    };
  },

  async create_work_experience(args, userId, deps) {
    const company = toStr(args.company);
    const title = toStr(args.title);
    const startDate = toDate(args.startDate);
    if (!company || !title || !startDate) {
      return invalid('company, title and a valid ISO 8601 startDate are required');
    }
    return {
      result: await deps.createWorkExperienceUseCase.execute({
        userId,
        company,
        title,
        startDate,
        location: toStr(args.location),
        endDate: toDate(args.endDate),
        description: toStr(args.description),
      }),
    };
  },

  async update_work_experience(args, userId, deps) {
    const workExperienceId = toStr(args.workExperienceId);
    if (!workExperienceId) return invalid('workExperienceId is required');
    return {
      result: await deps.updateWorkExperienceUseCase.execute({
        id: workExperienceId,
        userId,
        company: toStr(args.company),
        title: toStr(args.title),
        location: toStr(args.location),
        startDate: toDate(args.startDate),
        endDate: toDate(args.endDate),
        description: toStr(args.description),
      }),
    };
  },
};

/**
 * The handler for `name` when it is a write tool, else `undefined`. An own-
 * property check, not `in`: a client-chosen name like `toString` must not
 * reach Object.prototype.
 */
export function writeToolHandler(name: string | undefined): WriteToolHandler | undefined {
  return name !== undefined && Object.prototype.hasOwnProperty.call(WRITE_TOOL_HANDLERS, name)
    ? WRITE_TOOL_HANDLERS[name as WriteToolName]
    : undefined;
}
