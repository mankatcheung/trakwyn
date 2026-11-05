export interface IGetAiProviderOrderUseCase {
  /** The providers that can answer this user's AI calls, in the order they are tried. */
  execute(userId: string): Promise<string[]>;
}
