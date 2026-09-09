import { and, eq, isNull, sql } from 'drizzle-orm';
import { offer, jobApplication } from '#src/infrastructure/db/schema.js';
import type { DrizzleDb, DrizzleClient } from '#src/infrastructure/db/client.js';
import { getClient } from '#src/infrastructure/db/transactionContext.js';
import type {
  IOfferRepository,
  CreateOfferData,
  UpdateOfferData,
} from '#src/use-cases/ports/IOfferRepository.js';
import type { Offer } from '#src/domain/offer/Offer.js';

export class DrizzleOfferRepository implements IOfferRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  private toEntity(row: typeof offer.$inferSelect): Offer {
    return {
      id: row.id,
      applicationId: row.applicationId,
      baseSalary: row.baseSalary,
      bonus: row.bonus,
      equity: row.equity,
      benefits: row.benefits,
      costOfLivingAdjustment: row.costOfLivingAdjustment,
      currency: row.currency,
      period: row.period as Offer['period'],
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async countByApplicationId(applicationId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(offer)
      .where(eq(offer.applicationId, applicationId));
    return Number(row?.count ?? 0);
  }

  async findAllByApplicationId(applicationId: string): Promise<Offer[]> {
    const rows = await this.db.select().from(offer).where(eq(offer.applicationId, applicationId));
    return rows.map((row) => this.toEntity(row));
  }

  async findAllByUserId(userId: string): Promise<Offer[]> {
    const rows = await this.db
      .select({ offer })
      .from(offer)
      .innerJoin(jobApplication, eq(offer.applicationId, jobApplication.id))
      .where(and(eq(jobApplication.userId, userId), isNull(jobApplication.deletedAt)));
    return rows.map((r) => this.toEntity(r.offer));
  }

  async findById(id: string): Promise<Offer | null> {
    const rows = await this.db.select().from(offer).where(eq(offer.id, id));
    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  async create(data: CreateOfferData): Promise<Offer> {
    const now = new Date();
    const row = {
      id: data.id,
      applicationId: data.applicationId,
      baseSalary: data.baseSalary,
      bonus: data.bonus ?? null,
      equity: data.equity ?? null,
      benefits: data.benefits ?? null,
      costOfLivingAdjustment: data.costOfLivingAdjustment ?? null,
      currency: data.currency ?? 'USD',
      period: data.period ?? 'yearly',
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.insert(offer).values(row);
    return this.toEntity(row as typeof offer.$inferSelect);
  }

  async update(id: string, data: UpdateOfferData): Promise<Offer> {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.baseSalary !== undefined) updateData.baseSalary = data.baseSalary;
    if (data.bonus !== undefined) updateData.bonus = data.bonus;
    if (data.equity !== undefined) updateData.equity = data.equity;
    if (data.benefits !== undefined) updateData.benefits = data.benefits;
    if (data.costOfLivingAdjustment !== undefined)
      updateData.costOfLivingAdjustment = data.costOfLivingAdjustment;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.period !== undefined) updateData.period = data.period;
    if (data.notes !== undefined) updateData.notes = data.notes;

    await this.db.update(offer).set(updateData).where(eq(offer.id, id));
    const updated = await this.findById(id);
    return updated!;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(offer).where(eq(offer.id, id));
  }
}
