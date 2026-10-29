import type { WriteToolName } from '#src/interface-adapters/llm/toolCatalogue.js';

/** What a summary may name about the record a write targets, looked up by the caller. */
export interface SummaryTarget {
  /** "Acme / Frontend Engineer" for the application the write is about. */
  application?: string;
  /** The name of the contact, skill, education or work experience being changed. */
  record?: string;
  /** The round's type, when the write is about an interview round. */
  roundType?: string;
}

const CLIP = 60;

function clip(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > CLIP ? `${t.slice(0, CLIP).trimEnd()}…` : t;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function changed(args: Record<string, unknown>, idKey: string): string {
  const fields = Object.keys(args).filter((k) => k !== idKey);
  return fields.length ? ` (${fields.join(', ')})` : '';
}

function onApp(target: SummaryTarget): string {
  return target.application ? ` on ${target.application}` : '';
}

/**
 * One readable line for a confirmation card (JEF-469), from the arguments the
 * user is about to approve and the names of the records they point at. It
 * lives beside the catalogue, not in a use case, because it is wording for a
 * person, not policy. Each branch states exactly what the saved arguments
 * will do, so the card cannot say more or less than Confirm applies.
 */
export function summarizeChatWrite(
  tool: WriteToolName,
  args: Record<string, unknown>,
  target: SummaryTarget,
): string {
  switch (tool) {
    case 'create_application':
      return `Add application: ${str(args.company)} / ${str(args.role)}`;
    case 'update_application': {
      const name = target.application ?? 'application';
      const status = str(args.status);
      const rest = Object.keys(args).filter((k) => k !== 'applicationId' && k !== 'status');
      if (status && rest.length === 0) return `Move ${name} to ${status}`;
      return status
        ? `Move ${name} to ${status} and update ${rest.join(', ')}`
        : `Update ${name}${changed(args, 'applicationId')}`;
    }
    case 'trash_application':
      return `Move ${target.application ?? 'application'} to Trash`;
    case 'create_note':
      return `Add a note${onApp(target)}: “${clip(str(args.content) ?? '')}”`;
    case 'update_note':
      return `Edit a note${onApp(target)}: “${clip(str(args.content) ?? '')}”`;
    case 'create_contact':
      return `Add contact ${str(args.name)}${onApp(target)}`;
    case 'update_contact':
      return `Update contact ${target.record ?? ''}${changed(args, 'contactId')}`.replace(
        /\s+\(/,
        ' (',
      );
    case 'create_interview_round':
      return `Add ${str(args.type) ? `a ${str(args.type)} ` : 'an '}interview round${onApp(target)}`;
    case 'update_interview_round': {
      const outcome = str(args.outcome);
      return outcome
        ? `Mark the ${target.roundType ?? ''} interview round${onApp(target)} as ${outcome}`.replace(
            /\s{2,}/g,
            ' ',
          )
        : `Update the interview round${onApp(target)}${changed(args, 'interviewRoundId')}`;
    }
    case 'create_offer':
      return `Record an offer of ${args.baseSalary} ${str(args.currency) ?? 'USD'} ${
        str(args.period) ?? 'yearly'
      }${onApp(target)}`;
    case 'update_offer':
      return `Update the offer${onApp(target)}${changed(args, 'offerId')}`;
    case 'create_mock_interview_question':
      return `Add a practice question${onApp(target)}: “${clip(str(args.question) ?? '')}”`;
    case 'create_skill':
      return `Add skill ${str(args.name)}`;
    case 'update_skill':
      return `Update skill ${target.record ?? ''}${changed(args, 'skillId')}`;
    case 'create_education':
      return `Add education: ${str(args.institution)}`;
    case 'update_education':
      return `Update education at ${target.record ?? ''}${changed(args, 'educationId')}`;
    case 'create_work_experience':
      return `Add work experience: ${str(args.title)} at ${str(args.company)}`;
    case 'update_work_experience':
      return `Update work experience at ${target.record ?? ''}${changed(args, 'workExperienceId')}`;
  }
}
