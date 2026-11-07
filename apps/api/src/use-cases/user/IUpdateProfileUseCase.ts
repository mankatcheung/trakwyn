export interface UpdateProfileInput {
  userId: string;
  name?: string | null;
  timezone?: string | null;
  targetRole?: string | null;
  phone?: string | null;
  location?: string | null;
  /** Replaces the whole list; an empty list clears it. */
  profileLinks?: string[] | null;
  customAiPrompt?: string | null;
  useCrossApplicationContext?: boolean;
  llmFallbackWhenLimited?: boolean;
}

export interface IUpdateProfileUseCase {
  execute(input: UpdateProfileInput): Promise<void>;
}
