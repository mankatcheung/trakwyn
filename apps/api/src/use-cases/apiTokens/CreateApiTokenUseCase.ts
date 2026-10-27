import { createHash, randomBytes } from 'crypto';
import type { IApiTokenRepository } from '#src/use-cases/ports/IApiTokenRepository.js';
import type { ApiToken, ApiTokenScope } from '#src/domain/apiToken/ApiToken.js';
import { API_TOKEN, DEFAULTS } from '#src/use-cases/constants.js';

interface Deps {
  apiTokenRepository: IApiTokenRepository;
  generateId: () => string;
}

export interface CreateApiTokenInput {
  userId: string;
  name: string;
  scope?: ApiTokenScope;
}

export interface CreateApiTokenOutput {
  token: ApiToken;
  rawToken: string;
}

/**
 * Any plan may create a token: it works on `/mcp` for everyone (JEF-442), and
 * on the GraphQL API only while the owner's plan has `apiAccess`
 * (`ValidateApiTokenUseCase`), so there is nothing to refuse here.
 */
export class CreateApiTokenUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: CreateApiTokenInput): Promise<CreateApiTokenOutput> {
    const rawToken = `${API_TOKEN.PREFIX}${randomBytes(API_TOKEN.RANDOM_BYTES).toString('hex')}`;
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const token = await this.deps.apiTokenRepository.create({
      id: this.deps.generateId(),
      userId: input.userId,
      name: input.name,
      tokenHash,
      scope: input.scope ?? DEFAULTS.API_TOKEN_SCOPE,
    });

    return { token, rawToken };
  }
}
