import { describe, expect, it, vi } from 'vitest';
import { GetPostingRequirementsUseCase } from '#src/use-cases/postingRequirements/GetPostingRequirementsUseCase.js';
import { postingRequirementsPrompt } from '#src/use-cases/prompts/postingRequirements.js';
import { hashJobDescription } from '#src/use-cases/shared/hashJobDescription.js';
import {
  makeApplication,
  makeApplicationRepository,
  makePostingRequirements,
  makePostingRequirementsRepository,
} from '#src/__tests__/helpers/mocks/jobs.js';

const POSTING = 'Senior Backend Engineer. Required: PostgreSQL.';
const current = () =>
  makePostingRequirements({
    postingHash: hashJobDescription(POSTING),
    promptVersion: postingRequirementsPrompt.version,
  });

function build(
  app: ReturnType<typeof makeApplication> | null,
  saved: ReturnType<typeof makePostingRequirements> | null,
) {
  return new GetPostingRequirementsUseCase({
    applicationRepository: makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(app),
    }),
    postingRequirementsRepository: makePostingRequirementsRepository({
      findByApplicationId: vi.fn().mockResolvedValue(saved),
    }),
  });
}
const input = { userId: 'user-1', applicationId: 'app-1' };

describe('GetPostingRequirementsUseCase', () => {
  it('is null when the posting has never been read', async () => {
    const result = await build(makeApplication({ postingText: POSTING }), null).execute(input);

    expect(result).toBeNull();
  });

  it('returns the saved list, fresh while the posting is unchanged', async () => {
    const saved = current();

    const result = await build(makeApplication({ postingText: POSTING }), saved).execute(input);

    expect(result).toEqual({ ...saved, isStale: false });
  });

  it('marks it stale once the posting is edited, removed, or the prompt has moved on', async () => {
    const edited = await build(
      makeApplication({ postingText: `${POSTING} Kubernetes too.` }),
      current(),
    ).execute(input);
    const removed = await build(
      makeApplication({ description: null, postingText: null }),
      current(),
    ).execute(input);
    const olderPrompt = await build(makeApplication({ postingText: POSTING }), {
      ...current(),
      promptVersion: postingRequirementsPrompt.version - 1,
    }).execute(input);

    expect([edited?.isStale, removed?.isStale, olderPrompt?.isStale]).toEqual([true, true, true]);
  });

  it('is NOT_FOUND for a missing application and FORBIDDEN for someone else’s', async () => {
    await expect(build(null, null).execute(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      build(makeApplication({ userId: 'someone-else' }), current()).execute(input),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
