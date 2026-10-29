import { APPLICATION_STATUSES } from '#src/domain/application/ApplicationStatus.js';
import { NotFoundError, ValidationError } from '#src/use-cases/errors/DomainError.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { INoteRepository } from '#src/use-cases/ports/INoteRepository.js';
import type { IContactRepository } from '#src/use-cases/ports/IContactRepository.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import type { IOfferRepository } from '#src/use-cases/ports/IOfferRepository.js';
import type { ISkillRepository } from '#src/use-cases/ports/ISkillRepository.js';
import type { IEducationRepository } from '#src/use-cases/ports/IEducationRepository.js';
import type { IWorkExperienceRepository } from '#src/use-cases/ports/IWorkExperienceRepository.js';
import type { IChatWriteTools, PreparedChatWrite } from '#src/use-cases/ports/IChatWriteTools.js';
import { CHAT_WRITE_TOOLS, type WriteToolName } from '#src/interface-adapters/llm/toolCatalogue.js';
import {
  summarizeChatWrite,
  type SummaryTarget,
} from '#src/interface-adapters/llm/chatWriteSummary.js';
import { validateToolArgs } from '#src/interface-adapters/llm/validateToolArgs.js';
import {
  writeToolHandler,
  type WriteToolDeps,
} from '#src/interface-adapters/mcp/writeToolHandlers.js';

interface Deps extends WriteToolDeps {
  applicationRepository: IApplicationRepository;
  noteRepository: INoteRepository;
  contactRepository: IContactRepository;
  interviewRoundRepository: IInterviewRoundRepository;
  offerRepository: IOfferRepository;
  skillRepository: ISkillRepository;
  educationRepository: IEducationRepository;
  workExperienceRepository: IWorkExperienceRepository;
}

const NOT_FOUND = (what: string) => new NotFoundError(`${what} not found`);

/**
 * The chat assistant's write tools (JEF-469): the same catalogue entries and
 * `WRITE_TOOL_HANDLERS` MCP uses, but reached through a proposal the user
 * confirms. `prepare` runs when the model asks and changes nothing; `apply`
 * runs when the user presses Confirm.
 *
 * A record that is missing and one that belongs to someone else both read as
 * "not found", so a proposal cannot be used to probe other users' ids.
 */
export class ChatWriteTools implements IChatWriteTools {
  private readonly byName = new Map(CHAT_WRITE_TOOLS.map((tool) => [tool.name, tool]));

  constructor(private readonly deps: Deps) {}

  has(toolName: string): boolean {
    return this.byName.has(toolName as WriteToolName);
  }

  async prepare(
    toolName: string,
    rawArgs: Record<string, unknown>,
    userId: string,
  ): Promise<PreparedChatWrite> {
    const tool = this.byName.get(toolName as WriteToolName);
    if (!tool) throw new ValidationError(`Unknown tool: ${toolName}`);

    const args = validateToolArgs(tool.inputSchema, rawArgs);
    if (
      typeof args.status === 'string' &&
      !(APPLICATION_STATUSES as readonly string[]).includes(args.status)
    ) {
      throw new ValidationError(`status must be one of: ${APPLICATION_STATUSES.join(', ')}`);
    }

    const target = await this.resolveTarget(args, userId);
    return { args, summary: summarizeChatWrite(tool.name, args, target) };
  }

  async apply(toolName: string, args: Record<string, unknown>, userId: string): Promise<unknown> {
    const handler = this.has(toolName) ? writeToolHandler(toolName) : undefined;
    if (!handler) throw new ValidationError(`Unknown tool: ${toolName}`);
    const outcome = await handler(args, userId, this.deps);
    if ('invalid' in outcome) throw new ValidationError(outcome.invalid);
    return outcome.result;
  }

  /** Looks up every record the arguments name and proves each is the user's. */
  private async resolveTarget(
    args: Record<string, unknown>,
    userId: string,
  ): Promise<SummaryTarget> {
    const target: SummaryTarget = {};
    const id = (key: string): string | undefined =>
      typeof args[key] === 'string' ? (args[key] as string) : undefined;

    const applicationId = id('applicationId');
    if (applicationId) target.application = await this.application(applicationId, userId);

    const noteId = id('noteId');
    if (noteId) {
      const note = await this.deps.noteRepository.findById(noteId);
      if (!note) throw NOT_FOUND('Note');
      target.application = await this.application(note.applicationId, userId);
    }
    const contactId = id('contactId');
    if (contactId) {
      const contact = await this.deps.contactRepository.findById(contactId);
      if (!contact) throw NOT_FOUND('Contact');
      target.application = await this.application(contact.applicationId, userId);
      target.record = contact.name;
    }
    const roundId = id('interviewRoundId');
    if (roundId) {
      const round = await this.deps.interviewRoundRepository.findById(roundId);
      if (!round) throw NOT_FOUND('Interview round');
      target.application = await this.application(round.applicationId, userId);
      target.roundType = round.type;
    }
    const offerId = id('offerId');
    if (offerId) {
      const offer = await this.deps.offerRepository.findById(offerId);
      if (!offer) throw NOT_FOUND('Offer');
      target.application = await this.application(offer.applicationId, userId);
    }
    const skillId = id('skillId');
    if (skillId) {
      const skill = await this.deps.skillRepository.findById(skillId);
      if (!skill || skill.userId !== userId) throw NOT_FOUND('Skill');
      target.record = skill.name;
    }
    const educationId = id('educationId');
    if (educationId) {
      const education = await this.deps.educationRepository.findById(educationId);
      if (!education || education.userId !== userId) throw NOT_FOUND('Education');
      target.record = education.institution;
    }
    const workExperienceId = id('workExperienceId');
    if (workExperienceId) {
      const work = await this.deps.workExperienceRepository.findById(workExperienceId);
      if (!work || work.userId !== userId) throw NOT_FOUND('Work experience');
      target.record = work.company;
    }
    return target;
  }

  private async application(applicationId: string, userId: string): Promise<string> {
    const app = await this.deps.applicationRepository.findById(applicationId);
    if (!app || app.userId !== userId) throw NOT_FOUND('Application');
    return `${app.company} / ${app.role}`;
  }
}
