export interface SetAiSourceInput {
  userId: string;
  /** `auto` | `trakwyn` | `own`; anything else is a validation error. */
  aiSource: string;
}

export interface ISetAiSourceUseCase {
  execute(input: SetAiSourceInput): Promise<void>;
}
