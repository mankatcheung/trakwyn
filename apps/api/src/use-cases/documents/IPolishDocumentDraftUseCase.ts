export interface PolishDocumentDraftInput {
  userId: string;
  draftId: string;
  /** Optional steer, e.g. "make it shorter". */
  instructions?: string | null;
  /** The text to polish: what the editor holds now, which may be unsaved. */
  plainText: string;
}

export interface PolishDocumentDraftOutput {
  /** A proposal only: nothing is saved until the user accepts it. */
  markdown: string;
}

export interface IPolishDocumentDraftUseCase {
  execute(input: PolishDocumentDraftInput): Promise<PolishDocumentDraftOutput>;
}
