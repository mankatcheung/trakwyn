/**
 * The write tools chat may propose (JEF-469), behind a port because the
 * catalogue and its handlers are adapter-layer code that `use-cases/` may not
 * import.
 *
 * Chat never runs a write when the model asks for it: `prepare` checks the
 * call and describes it, the proposal is stored, and `apply` runs only after
 * the user confirms.
 */
export interface PreparedChatWrite {
  /** The arguments reduced to the ones the tool declares, as they will be applied. */
  args: Record<string, unknown>;
  /** One line for the confirmation card. */
  summary: string;
}

export interface IChatWriteTools {
  /** Whether chat offers this tool as a proposal. Deletes are never in it. */
  has(toolName: string): boolean;
  /**
   * Validates the arguments against the tool's schema and checks that every
   * record it names belongs to `userId`. Throws a `DomainError` otherwise, so a
   * foreign id fails when proposed, not just when confirmed. Changes nothing.
   */
  prepare(
    toolName: string,
    args: Record<string, unknown>,
    userId: string,
  ): Promise<PreparedChatWrite>;
  /** Runs the saved arguments through the same handler MCP uses. */
  apply(toolName: string, args: Record<string, unknown>, userId: string): Promise<unknown>;
}
