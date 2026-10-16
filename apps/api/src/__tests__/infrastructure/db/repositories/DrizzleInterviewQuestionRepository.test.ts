import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { DrizzleInterviewQuestionRepository } from '#src/infrastructure/db/repositories/DrizzleInterviewQuestionRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import {
  user,
  jobApplication,
  interviewRound,
  interviewQuestion,
} from '#src/infrastructure/db/schema.js';
import { CONTENT_LIMITS } from '#src/use-cases/constants.js';
import { QuotaExceededError } from '#src/use-cases/errors/DomainError.js';

describe('DrizzleInterviewQuestionRepository', () => {
  let db: TestDb;
  let repo: DrizzleInterviewQuestionRepository;

  const questionCount = async (roundId: string): Promise<number> => {
    const [row] = await db.db
      .select({ count: interviewRound.questionCount })
      .from(interviewRound)
      .where(eq(interviewRound.id, roundId));
    return row.count;
  };

  beforeAll(async () => {
    db = await createTestDb();
    repo = new DrizzleInterviewQuestionRepository({ db: db.db });
    await db.db.insert(user).values({ id: 'u1', email: 'u@t.com', passwordHash: 'h' });
    await db.db.insert(jobApplication).values({
      id: 'app-1',
      userId: 'u1',
      company: 'Acme',
      role: 'Eng',
      status: 'draft',
    });
  });

  afterAll(() => db.cleanup());

  beforeEach(async () => {
    await db.db.delete(interviewQuestion);
    await db.db.delete(interviewRound);
    await db.db.insert(interviewRound).values([
      { id: 'r1', applicationId: 'app-1', type: 'phone' },
      { id: 'r2', applicationId: 'app-1', type: 'onsite' },
    ]);
  });

  describe('create', () => {
    it('persists a question without an answer and returns the entity', async () => {
      const created = await repo.create({ id: 'q1', interviewRoundId: 'r1', question: 'Why us?' });

      expect(created).toMatchObject({
        id: 'q1',
        interviewRoundId: 'r1',
        question: 'Why us?',
        answer: null,
        position: 0,
      });
    });

    it('persists an answer when given', async () => {
      const created = await repo.create({
        id: 'q1',
        interviewRoundId: 'r1',
        question: 'Why us?',
        answer: 'The product.',
      });

      expect(created.answer).toBe('The product.');
    });

    it('appends each new question after the last and counts them on the round', async () => {
      await repo.create({ id: 'q1', interviewRoundId: 'r1', question: 'One' });
      const second = await repo.create({ id: 'q2', interviewRoundId: 'r1', question: 'Two' });
      const other = await repo.create({ id: 'q3', interviewRoundId: 'r2', question: 'Elsewhere' });

      expect(second.position).toBe(1);
      expect(other.position).toBe(0);
      expect(await questionCount('r1')).toBe(2);
      expect(await questionCount('r2')).toBe(1);
    });

    it('places a new question after the survivors when an earlier one was deleted', async () => {
      await repo.create({ id: 'q1', interviewRoundId: 'r1', question: 'One' });
      await repo.create({ id: 'q2', interviewRoundId: 'r1', question: 'Two' });
      await repo.create({ id: 'q3', interviewRoundId: 'r1', question: 'Three' });
      await repo.delete('q1');

      const added = await repo.create({ id: 'q4', interviewRoundId: 'r1', question: 'Four' });
      const ids = (await repo.findAllByRoundId('r1')).map((q) => q.id);

      expect(added.position).toBe(3);
      expect(ids).toEqual(['q2', 'q3', 'q4']);
    });

    it('rejects the question past the per-round limit and leaves the count alone', async () => {
      await db.db
        .update(interviewRound)
        .set({ questionCount: CONTENT_LIMITS.QUESTIONS_PER_ROUND })
        .where(eq(interviewRound.id, 'r1'));

      const err = await repo
        .create({ id: 'q-over', interviewRoundId: 'r1', question: 'One too many' })
        .catch((e) => e);

      expect(err).toBeInstanceOf(QuotaExceededError);
      expect(await repo.findById('q-over')).toBeNull();
      expect(await questionCount('r1')).toBe(CONTENT_LIMITS.QUESTIONS_PER_ROUND);
    });

    it('limits each round on its own', async () => {
      await db.db
        .update(interviewRound)
        .set({ questionCount: CONTENT_LIMITS.QUESTIONS_PER_ROUND })
        .where(eq(interviewRound.id, 'r1'));

      const created = await repo.create({ id: 'q1', interviewRoundId: 'r2', question: 'Fine' });

      expect(created.interviewRoundId).toBe('r2');
    });
  });

  describe('findAllByRoundId', () => {
    it('returns only that round, in position order', async () => {
      await repo.create({ id: 'q1', interviewRoundId: 'r1', question: 'One' });
      await repo.create({ id: 'q2', interviewRoundId: 'r1', question: 'Two' });
      await repo.create({ id: 'q3', interviewRoundId: 'r2', question: 'Other' });
      await repo.reorder('r1', ['q2', 'q1']);

      const result = await repo.findAllByRoundId('r1');

      expect(result.map((q) => q.id)).toEqual(['q2', 'q1']);
    });

    it('returns an empty list for a round with no questions', async () => {
      expect(await repo.findAllByRoundId('r1')).toEqual([]);
    });
  });

  describe('update', () => {
    it('changes the question and answer', async () => {
      await repo.create({ id: 'q1', interviewRoundId: 'r1', question: 'Old' });

      const updated = await repo.update('q1', { question: 'New', answer: 'Replied' });

      expect(updated).toMatchObject({ question: 'New', answer: 'Replied' });
    });

    it('leaves fields that are not provided, and clears an answer set to null', async () => {
      await repo.create({ id: 'q1', interviewRoundId: 'r1', question: 'Q', answer: 'A' });

      const untouched = await repo.update('q1', { question: 'Q2' });
      const cleared = await repo.update('q1', { answer: null });

      expect(untouched.answer).toBe('A');
      expect(cleared.answer).toBeNull();
      expect(cleared.question).toBe('Q2');
    });
  });

  describe('delete', () => {
    it('removes the row and releases the quota slot', async () => {
      await repo.create({ id: 'q1', interviewRoundId: 'r1', question: 'One' });
      await repo.create({ id: 'q2', interviewRoundId: 'r1', question: 'Two' });

      await repo.delete('q1');

      expect(await repo.findById('q1')).toBeNull();
      expect(await questionCount('r1')).toBe(1);
    });

    it('does nothing, and does not drive the count negative, for a missing id', async () => {
      await repo.delete('missing');

      expect(await questionCount('r1')).toBe(0);
    });

    it('frees room so a full round can take another question', async () => {
      await repo.create({ id: 'q1', interviewRoundId: 'r1', question: 'One' });
      await db.db
        .update(interviewRound)
        .set({ questionCount: CONTENT_LIMITS.QUESTIONS_PER_ROUND })
        .where(eq(interviewRound.id, 'r1'));

      await repo.delete('q1');
      const created = await repo.create({ id: 'q2', interviewRoundId: 'r1', question: 'Two' });

      expect(created.id).toBe('q2');
    });
  });

  describe('reorder', () => {
    it('sets positions to the index in the given list', async () => {
      await repo.create({ id: 'a', interviewRoundId: 'r1', question: 'A' });
      await repo.create({ id: 'b', interviewRoundId: 'r1', question: 'B' });
      await repo.create({ id: 'c', interviewRoundId: 'r1', question: 'C' });

      await repo.reorder('r1', ['c', 'a', 'b']);

      const result = await repo.findAllByRoundId('r1');
      expect(result.map((q) => [q.id, q.position])).toEqual([
        ['c', 0],
        ['a', 1],
        ['b', 2],
      ]);
    });

    it("does not move another round's questions", async () => {
      await repo.create({ id: 'a', interviewRoundId: 'r1', question: 'A' });
      await repo.create({ id: 'x', interviewRoundId: 'r2', question: 'X' });

      await repo.reorder('r1', ['x', 'a']);

      expect((await repo.findById('x'))?.position).toBe(0);
    });
  });

  it('deletes a round’s questions when the round is deleted', async () => {
    await repo.create({ id: 'q1', interviewRoundId: 'r1', question: 'One' });

    await db.db.delete(interviewRound).where(eq(interviewRound.id, 'r1'));

    expect(await repo.findById('q1')).toBeNull();
  });
});
