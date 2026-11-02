import type { IEntitlementService } from '#src/use-cases/ports/IEntitlementService.js';
import { createHash, randomBytes } from 'crypto';
import type { IShareLinkRepository } from '#src/use-cases/ports/IShareLinkRepository.js';
import type { ShareLink } from '#src/domain/shareLink/ShareLink.js';
import { CONTENT_LIMITS, SHARE_LINK } from '#src/use-cases/constants.js';
import { assertUnderLimit } from '#src/use-cases/shared/assertUnderLimit.js';

interface Deps {
  entitlementService: IEntitlementService;
  shareLinkRepository: IShareLinkRepository;
  generateId: () => string;
}

export interface CreateShareLinkInput {
  userId: string;
  name: string;
}

export interface CreateShareLinkOutput {
  shareLink: ShareLink;
  rawToken: string;
}

export class CreateShareLinkUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: CreateShareLinkInput): Promise<CreateShareLinkOutput> {
    await this.deps.entitlementService.assertFeature(input.userId, 'shareLinks');
    const existing = await this.deps.shareLinkRepository.findAllByUserId(input.userId);
    assertUnderLimit(existing.length, CONTENT_LIMITS.SHARE_LINKS_PER_USER, 'share links');
    const rawToken = `${SHARE_LINK.PREFIX}${randomBytes(SHARE_LINK.RANDOM_BYTES).toString('hex')}`;
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const link = await this.deps.shareLinkRepository.create({
      id: this.deps.generateId(),
      userId: input.userId,
      name: input.name,
      tokenHash,
    });

    return { shareLink: link, rawToken };
  }
}
