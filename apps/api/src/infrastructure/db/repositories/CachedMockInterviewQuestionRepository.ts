import type { MockInterviewQuestion } from '#src/domain/interviewRound/MockInterviewQuestion.js';
import type {
  IMockInterviewQuestionRepository,
  CreateMockInterviewQuestionData,
  UpdateMockInterviewQuestionData,
} from '#src/use-cases/ports/IMockInterviewQuestionRepository.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import type { ICache } from '#src/infrastructure/cache/ICache.js';
import { CACHE_KEYS } from '#src/infrastructure/config/constants.js';

interface Deps {
  drizzleMockInterviewQuestionRepository: IMockInterviewQuestionRepository;
  interviewRoundRepository: IInterviewRoundRepository;
  cache: ICache;
}

/**
 * Questions are not cached themselves, but each round carries a `mockQuestionCount`
 * that the round caches hold. Every write that moves the count (create and
 * delete) drops those entries so the count on the card never goes stale.
 */
export class CachedMockInterviewQuestionRepository implements IMockInterviewQuestionRepository {
  private readonly inner: IMockInterviewQuestionRepository;
  private readonly rounds: IInterviewRoundRepository;
  private readonly cache: ICache;

  constructor({ drizzleMockInterviewQuestionRepository, interviewRoundRepository, cache }: Deps) {
    this.inner = drizzleMockInterviewQuestionRepository;
    this.rounds = interviewRoundRepository;
    this.cache = cache;
  }

  findAllByRoundId(interviewRoundId: string): Promise<MockInterviewQuestion[]> {
    return this.inner.findAllByRoundId(interviewRoundId);
  }

  findById(id: string): Promise<MockInterviewQuestion | null> {
    return this.inner.findById(id);
  }

  async create(data: CreateMockInterviewQuestionData): Promise<MockInterviewQuestion> {
    const result = await this.inner.create(data);
    await this.invalidateRound(result.interviewRoundId);
    return result;
  }

  update(id: string, data: UpdateMockInterviewQuestionData): Promise<MockInterviewQuestion> {
    return this.inner.update(id, data);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.inner.findById(id);
    await this.inner.delete(id);
    if (existing) await this.invalidateRound(existing.interviewRoundId);
  }

  reorder(interviewRoundId: string, orderedIds: string[]): Promise<void> {
    return this.inner.reorder(interviewRoundId, orderedIds);
  }

  private async invalidateRound(interviewRoundId: string): Promise<void> {
    const round = await this.rounds.findById(interviewRoundId);
    await this.cache.delete(CACHE_KEYS.roundById(interviewRoundId));
    if (round) await this.cache.delete(CACHE_KEYS.roundList(round.applicationId));
  }
}
