export interface SetAiProviderOrderInput {
  userId: string;
  /** `trakwyn` and/or ids of the user's own keys, first to last. */
  order: string[];
}

export interface ISetAiProviderOrderUseCase {
  execute(input: SetAiProviderOrderInput): Promise<void>;
}
