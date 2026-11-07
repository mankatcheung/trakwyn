import { NotFoundError, ValidationError } from '#src/use-cases/errors/DomainError.js';
import {
  validateLocation,
  validatePhone,
  validateProfileLinks,
} from '#src/use-cases/shared/profileContact.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type {
  IUpdateProfileUseCase,
  UpdateProfileInput,
} from '#src/use-cases/user/IUpdateProfileUseCase.js';

interface Deps {
  userRepository: IUserRepository;
}

const MAX_NAME_LENGTH = 100;
const MAX_TARGET_ROLE_LENGTH = 100;
const MAX_AI_PROMPT_LENGTH = 500;

function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Trims a nullable string field; an empty result clears the field (null). Undefined leaves it untouched. */
function normalize(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export class UpdateProfileUseCase implements IUpdateProfileUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: UpdateProfileInput): Promise<void> {
    const user = await this.deps.userRepository.findById(input.userId);
    if (!user) throw new NotFoundError('User not found');

    const name = normalize(input.name);
    const timezone = normalize(input.timezone);
    const targetRole = normalize(input.targetRole);
    const customAiPrompt = normalize(input.customAiPrompt);

    if (name && name.length > MAX_NAME_LENGTH) {
      throw new ValidationError('Name is too long');
    }
    if (targetRole && targetRole.length > MAX_TARGET_ROLE_LENGTH) {
      throw new ValidationError('Target role is too long');
    }
    if (customAiPrompt && customAiPrompt.length > MAX_AI_PROMPT_LENGTH) {
      throw new ValidationError('AI prompt is too long');
    }
    if (timezone && !isValidTimezone(timezone)) {
      throw new ValidationError('Invalid timezone');
    }

    // Undefined leaves a field alone; null or blank clears it.
    const phone = input.phone === undefined ? undefined : validatePhone(input.phone);
    const location = input.location === undefined ? undefined : validateLocation(input.location);
    const profileLinks =
      input.profileLinks === undefined ? undefined : validateProfileLinks(input.profileLinks);

    await this.deps.userRepository.update(input.userId, {
      name,
      timezone,
      targetRole,
      phone,
      location,
      profileLinks,
      customAiPrompt,
      useCrossApplicationContext: input.useCrossApplicationContext,
      llmFallbackWhenLimited: input.llmFallbackWhenLimited,
      // Only the toggle (an older app) resets a saved order; an unrelated profile edit leaves it alone.
      ...(input.llmFallbackWhenLimited === undefined ? {} : { aiProviderOrder: null }),
    });
  }
}
