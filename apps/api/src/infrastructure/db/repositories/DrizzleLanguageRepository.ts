import { asc, eq } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { language } from '../schema.js';
import type { Language } from '#src/domain/language/Language.js';
import type {
  ILanguageRepository,
  CreateLanguageData,
  UpdateLanguageData,
} from '#src/use-cases/ports/ILanguageRepository.js';
import { getClient } from '../transactionContext.js';

type Row = typeof language.$inferSelect;

export class DrizzleLanguageRepository implements ILanguageRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  async findAllByUserId(userId: string): Promise<Language[]> {
    const rows = await this.db
      .select()
      .from(language)
      .where(eq(language.userId, userId))
      .orderBy(asc(language.createdAt), asc(language.id));
    return rows.map((r) => this.toEntity(r));
  }

  async findById(id: string): Promise<Language | null> {
    const [row] = await this.db.select().from(language).where(eq(language.id, id)).limit(1);
    return row ? this.toEntity(row) : null;
  }

  async create(data: CreateLanguageData): Promise<Language> {
    const [row] = await this.db
      .insert(language)
      .values({
        id: data.id,
        userId: data.userId,
        name: data.name,
        proficiency: data.proficiency ?? null,
      })
      .returning();
    return this.toEntity(row);
  }

  async update(id: string, data: UpdateLanguageData): Promise<Language> {
    const [row] = await this.db.update(language).set(data).where(eq(language.id, id)).returning();
    return this.toEntity(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(language).where(eq(language.id, id));
  }

  private toEntity(row: Row): Language {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      proficiency: row.proficiency,
      createdAt: row.createdAt,
    };
  }
}
