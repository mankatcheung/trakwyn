import { desc, eq } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { award } from '../schema.js';
import type { Award } from '#src/domain/award/Award.js';
import type {
  IAwardRepository,
  CreateAwardData,
  UpdateAwardData,
} from '#src/use-cases/ports/IAwardRepository.js';
import { getClient } from '../transactionContext.js';

type Row = typeof award.$inferSelect;

export class DrizzleAwardRepository implements IAwardRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  async findAllByUserId(userId: string): Promise<Award[]> {
    const rows = await this.db
      .select()
      .from(award)
      .where(eq(award.userId, userId))
      .orderBy(desc(award.date), desc(award.createdAt), desc(award.id));
    return rows.map((r) => this.toEntity(r));
  }

  async findById(id: string): Promise<Award | null> {
    const [row] = await this.db.select().from(award).where(eq(award.id, id)).limit(1);
    return row ? this.toEntity(row) : null;
  }

  async create(data: CreateAwardData): Promise<Award> {
    const [row] = await this.db
      .insert(award)
      .values({
        id: data.id,
        userId: data.userId,
        title: data.title,
        issuer: data.issuer ?? null,
        date: data.date ?? null,
        description: data.description ?? null,
      })
      .returning();
    return this.toEntity(row);
  }

  async update(id: string, data: UpdateAwardData): Promise<Award> {
    const [row] = await this.db.update(award).set(data).where(eq(award.id, id)).returning();
    return this.toEntity(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(award).where(eq(award.id, id));
  }

  private toEntity(row: Row): Award {
    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      issuer: row.issuer,
      date: row.date,
      description: row.description,
      createdAt: row.createdAt,
    };
  }
}
