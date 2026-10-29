import type { McpActor } from '#src/use-cases/shared/mcpActor.js';
import type { Note } from '#src/domain/note/Note.js';

export interface CreateNoteInput {
  userId: string;
  applicationId: string;
  content: string;
  /** Set when an MCP client made the change; recorded in the activity log. */
  actor?: McpActor;
}

export type CreateNoteOutput = Note;

export interface ICreateNoteUseCase {
  execute(input: CreateNoteInput): Promise<CreateNoteOutput>;
}
