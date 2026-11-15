import { desc, eq } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { certification } from '../schema.js';
import type { Certification } from '#src/domain/certification/Certification.js';
import type {
  ICertificationRepository,
  CreateCertificationData,
  UpdateCertificationData,
} from '#src/use-cases/ports/ICertificationRepository.js';
import { getClient } from '../transactionContext.js';

type Row = typeof certification.$inferSelect;

export class DrizzleCertificationRepository implements ICertificationRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  async findAllByUserId(userId: string): Promise<Certification[]> {
    const rows = await this.db
      .select()
      .from(certification)
      .where(eq(certification.userId, userId))
      .orderBy(desc(certification.issuedAt), desc(certification.createdAt), desc(certification.id));
    return rows.map((r) => this.toEntity(r));
  }

  async findById(id: string): Promise<Certification | null> {
    const [row] = await this.db
      .select()
      .from(certification)
      .where(eq(certification.id, id))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async create(data: CreateCertificationData): Promise<Certification> {
    const [row] = await this.db
      .insert(certification)
      .values({
        id: data.id,
        userId: data.userId,
        name: data.name,
        issuer: data.issuer ?? null,
        issuedAt: data.issuedAt ?? null,
        expiresAt: data.expiresAt ?? null,
        credentialUrl: data.credentialUrl ?? null,
      })
      .returning();
    return this.toEntity(row);
  }

  async update(id: string, data: UpdateCertificationData): Promise<Certification> {
    const [row] = await this.db
      .update(certification)
      .set(data)
      .where(eq(certification.id, id))
      .returning();
    return this.toEntity(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(certification).where(eq(certification.id, id));
  }

  private toEntity(row: Row): Certification {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      issuer: row.issuer,
      issuedAt: row.issuedAt,
      expiresAt: row.expiresAt,
      credentialUrl: row.credentialUrl,
      createdAt: row.createdAt,
    };
  }
}
