import {
  eq,
  and,
  or,
  asc,
  desc,
  gte,
  lte,
  lt,
  ilike,
  isNull,
  isNotNull,
  inArray,
  sql,
} from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { jobApplication, applicationTag, user } from '../schema.js';
import type { Application } from '#src/domain/application/Application.js';
import type { ApplicationStatus } from '#src/domain/application/ApplicationStatus.js';
import type {
  IApplicationRepository,
  CreateApplicationData,
  UpdateApplicationData,
  FindApplicationsPageFilters,
  FindApplicationsPagePagination,
  ApplicationsPage,
} from '#src/use-cases/ports/IApplicationRepository.js';
import { txStorage, getClient } from '../transactionContext.js';
import { CONTENT_LIMITS, REMINDER_WINDOW_MS } from '#src/use-cases/constants.js';
import { QuotaExceededError } from '#src/use-cases/errors/DomainError.js';
import { LIKELY_GHOSTED_AFTER_DAYS } from '#src/use-cases/jobs/applicationStaleness.js';

type AppRow = typeof jobApplication.$inferSelect & { tags: string[] };

export class DrizzleApplicationRepository implements IApplicationRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  private async attachTags(rows: (typeof jobApplication.$inferSelect)[]): Promise<AppRow[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const tagRows = await this.db
      .select()
      .from(applicationTag)
      .where(inArray(applicationTag.applicationId, ids));
    const byApp = new Map<string, string[]>();
    for (const t of tagRows) {
      const list = byApp.get(t.applicationId) ?? [];
      list.push(t.name);
      byApp.set(t.applicationId, list);
    }
    return rows.map((r) => ({ ...r, tags: byApp.get(r.id) ?? [] }));
  }

  async findAllByUserId(
    userId: string,
    filters?: { status?: ApplicationStatus },
  ): Promise<Application[]> {
    const conditions = [eq(jobApplication.userId, userId), isNull(jobApplication.deletedAt)];
    if (filters?.status) conditions.push(eq(jobApplication.status, filters.status));

    const rows = await this.db
      .select()
      .from(jobApplication)
      .where(and(...conditions))
      .orderBy(desc(jobApplication.createdAt), desc(jobApplication.id));
    const withTags = await this.attachTags(rows);
    return withTags.map((r) => this.toEntity(r));
  }

  async findPageByUserId(
    userId: string,
    filters: FindApplicationsPageFilters,
    pagination: FindApplicationsPagePagination,
  ): Promise<ApplicationsPage> {
    const search = filters.search?.trim();
    const { limit, cursor } = pagination;

    const conditions = [eq(jobApplication.userId, userId), isNull(jobApplication.deletedAt)];
    if (filters.status) conditions.push(eq(jobApplication.status, filters.status));
    if (filters.starred) conditions.push(eq(jobApplication.starred, true));
    if (filters.likelyGhosted) {
      const cutoff = new Date(Date.now() - LIKELY_GHOSTED_AFTER_DAYS * 24 * 60 * 60 * 1000);
      conditions.push(
        and(
          inArray(jobApplication.status, ['applied', 'interviewing']),
          isNotNull(jobApplication.appliedAt),
          lte(jobApplication.updatedAt, cutoff),
          or(isNull(jobApplication.reminderSentAt), lte(jobApplication.reminderSentAt, cutoff)),
        )!,
      );
    }
    if (search) {
      // ILIKE, not LIKE: SQLite's LIKE ignored case, Postgres's does not,
      // and the search box has always been case-insensitive.
      conditions.push(
        or(
          ilike(jobApplication.company, `%${search}%`),
          ilike(jobApplication.role, `%${search}%`),
          ilike(jobApplication.location, `%${search}%`),
          ilike(jobApplication.description, `%${search}%`),
        )!,
      );
    }

    if (cursor) {
      const [cursorRow] = await this.db
        .select({ createdAt: jobApplication.createdAt, id: jobApplication.id })
        .from(jobApplication)
        .where(eq(jobApplication.id, cursor))
        .limit(1);
      if (cursorRow) {
        conditions.push(
          or(
            lt(jobApplication.createdAt, cursorRow.createdAt),
            and(
              eq(jobApplication.createdAt, cursorRow.createdAt),
              lt(jobApplication.id, cursorRow.id),
            ),
          )!,
        );
      }
    }

    const rows = await this.db
      .select()
      .from(jobApplication)
      .where(and(...conditions))
      .orderBy(desc(jobApplication.createdAt), desc(jobApplication.id))
      .limit(limit + 1);

    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;
    const withTags = await this.attachTags(items);
    return { items: withTags.map((r) => this.toEntity(r)), hasNextPage };
  }

  /**
   * Live applications only. Trashed ones read as missing, which is what makes
   * the 38 use cases that gate on this refuse to act on one without any of
   * them having to know Trash exists.
   */
  async findById(id: string): Promise<Application | null> {
    return this.findOne(and(eq(jobApplication.id, id), isNull(jobApplication.deletedAt)));
  }

  /**
   * The deliberate exception, for the two callers that must see a trashed
   * application: the detail query — so a link from an old email or
   * notification lands on a read-only view with a Restore banner rather than a
   * 404 — and the Trash operations themselves.
   */
  async findByIdIncludingTrashed(id: string): Promise<Application | null> {
    return this.findOne(eq(jobApplication.id, id));
  }

  private async findOne(where: SQL | undefined): Promise<Application | null> {
    const [row] = await this.db.select().from(jobApplication).where(where).limit(1);
    if (!row) return null;
    const [withTags] = await this.attachTags([row]);
    return this.toEntity(withTags);
  }

  async findTrashedByUserId(userId: string): Promise<Application[]> {
    const rows = await this.db
      .select()
      .from(jobApplication)
      .where(and(eq(jobApplication.userId, userId), isNotNull(jobApplication.deletedAt)))
      .orderBy(desc(jobApplication.deletedAt), desc(jobApplication.id));
    const withTags = await this.attachTags(rows);
    return withTags.map((r) => this.toEntity(r));
  }

  /** Trashed longer than the retention window, so the purge job can finish the job. */
  async findDueForPurge(deletedBefore: Date): Promise<Application[]> {
    const rows = await this.db
      .select()
      .from(jobApplication)
      .where(
        and(isNotNull(jobApplication.deletedAt), lte(jobApplication.deletedAt, deletedBefore)),
      );
    const withTags = await this.attachTags(rows);
    return withTags.map((r) => this.toEntity(r));
  }

  async softDelete(id: string, deletedAt: Date): Promise<void> {
    await this.db.update(jobApplication).set({ deletedAt }).where(eq(jobApplication.id, id));
  }

  async restore(id: string): Promise<void> {
    // One statement, because the children were never touched — they are hidden
    // by their parent being hidden, not by anything having happened to them.
    await this.db.update(jobApplication).set({ deletedAt: null }).where(eq(jobApplication.id, id));
  }

  async create(data: CreateApplicationData): Promise<Application> {
    const tags = data.tags ?? [];

    const exec = async (client: DrizzleClient): Promise<AppRow> => {
      const [reserved] = await client
        .update(user)
        .set({
          applicationCount: sql`${user.applicationCount} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(user.id, data.userId),
            lt(user.applicationCount, CONTENT_LIMITS.APPLICATIONS_PER_USER),
          ),
        )
        .returning({ id: user.id });

      if (!reserved) {
        throw new QuotaExceededError(
          `You have reached the maximum of ${CONTENT_LIMITS.APPLICATIONS_PER_USER} applications`,
        );
      }

      const [app] = await client
        .insert(jobApplication)
        .values({
          id: data.id,
          userId: data.userId,
          company: data.company,
          role: data.role,
          status: data.status,
          jobUrl: data.jobUrl ?? null,
          location: data.location ?? null,
          salaryRange: data.salaryRange ?? null,
          description: data.description ?? null,
          starred: data.starred ?? false,
          source: data.source ?? null,
          followUpAt: data.followUpAt ?? null,
        })
        .returning();
      if (tags.length > 0) {
        await client
          .insert(applicationTag)
          .values(tags.map((tag) => ({ id: tag.id, applicationId: app.id, name: tag.name })));
      }
      return { ...app, tags: tags.map((t) => t.name) };
    };

    const ambient = txStorage.getStore();
    const row = ambient ? await exec(ambient) : await this.database.transaction(exec);
    return this.toEntity(row);
  }

  async update(id: string, data: UpdateApplicationData): Promise<Application> {
    const scalarData = {
      ...(data.company !== undefined ? { company: data.company } : {}),
      ...(data.role !== undefined ? { role: data.role } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.jobUrl !== undefined ? { jobUrl: data.jobUrl } : {}),
      ...(data.location !== undefined ? { location: data.location } : {}),
      ...(data.salaryRange !== undefined ? { salaryRange: data.salaryRange } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.appliedAt !== undefined ? { appliedAt: data.appliedAt } : {}),
      ...(data.starred !== undefined ? { starred: data.starred } : {}),
      ...(data.source !== undefined ? { source: data.source } : {}),
      ...(data.followUpAt !== undefined ? { followUpAt: data.followUpAt } : {}),
      ...(data.boardPosition !== undefined ? { boardPosition: data.boardPosition } : {}),
    };

    if (data.tags !== undefined) {
      const tags = data.tags;
      const exec = async (client: DrizzleClient): Promise<AppRow> => {
        // .set() throws "No values to set" given a literal {} (a tags-only
        // update has no scalar fields) — updatedAt is always safe to include
        // explicitly since every update should bump it anyway.
        const [app] = await client
          .update(jobApplication)
          .set({ ...scalarData, updatedAt: new Date() })
          .where(eq(jobApplication.id, id))
          .returning();
        await client.delete(applicationTag).where(eq(applicationTag.applicationId, id));
        if (tags.length > 0) {
          await client
            .insert(applicationTag)
            .values(tags.map((tag) => ({ id: tag.id, applicationId: id, name: tag.name })));
        }
        return { ...app, tags: tags.map((t) => t.name) };
      };

      const ambient = txStorage.getStore();
      const row = ambient ? await exec(ambient) : await this.database.transaction(exec);
      return this.toEntity(row);
    }

    const [row] = await this.db
      .update(jobApplication)
      .set({ ...scalarData, updatedAt: new Date() })
      .where(eq(jobApplication.id, id))
      .returning();
    const [withTags] = await this.attachTags([row]);
    return this.toEntity(withTags);
  }

  async delete(id: string): Promise<void> {
    const exec = async (client: DrizzleClient): Promise<void> => {
      const [deleted] = await client
        .delete(jobApplication)
        .where(eq(jobApplication.id, id))
        .returning({ userId: jobApplication.userId });
      if (!deleted) return;

      await client
        .update(user)
        .set({
          applicationCount: sql`case when ${user.applicationCount} > 0 then ${user.applicationCount} - 1 else 0 end`,
          updatedAt: new Date(),
        })
        .where(eq(user.id, deleted.userId));
    };

    const ambient = txStorage.getStore();
    if (ambient) await exec(ambient);
    else await this.database.transaction(exec);
  }

  async reorderBoard(
    userId: string,
    status: ApplicationStatus,
    orderedIds: string[],
  ): Promise<Application[]> {
    if (orderedIds.length > 0) {
      // One statement rather than a write per card: a CASE over the id maps
      // each row to its index in `orderedIds`.
      const positions = sql.join(
        orderedIds.map((id, index) => sql`when ${id} then ${index}::integer`),
        sql` `,
      );

      await this.db
        .update(jobApplication)
        .set({
          boardPosition: sql`case ${jobApplication.id} ${positions} end`,
          // Self-assignment, deliberately. `updatedAt` carries `$onUpdate`,
          // which drizzle applies only to columns absent from the set — and
          // `isLikelyGhosted` reads `updatedAt`. Letting it fire here would
          // clear the ghosted badge from every card in the column because the
          // user dragged one of them. The test asserting `updatedAt` survives
          // a reorder is what keeps this honest.
          updatedAt: sql`${jobApplication.updatedAt}`,
        })
        .where(
          and(
            inArray(jobApplication.id, orderedIds),
            eq(jobApplication.userId, userId),
            eq(jobApplication.status, status),
            isNull(jobApplication.deletedAt),
          ),
        );
    }

    const rows = await this.db
      .select()
      .from(jobApplication)
      .where(
        and(
          eq(jobApplication.userId, userId),
          eq(jobApplication.status, status),
          isNull(jobApplication.deletedAt),
        ),
      )
      .orderBy(
        asc(jobApplication.boardPosition),
        desc(jobApplication.createdAt),
        desc(jobApplication.id),
      );
    const withTags = await this.attachTags(rows);
    return withTags.map((r) => this.toEntity(r));
  }

  async findDueForReminder(): Promise<Application[]> {
    const now = new Date();
    const in24h = new Date(now.getTime() + REMINDER_WINDOW_MS.DUE_WITHIN);
    const resendThreshold = new Date(now.getTime() - REMINDER_WINDOW_MS.RESEND_AFTER);
    const rows = await this.db
      .select()
      .from(jobApplication)
      .where(
        and(
          isNull(jobApplication.deletedAt),
          gte(jobApplication.followUpAt, now),
          lte(jobApplication.followUpAt, in24h),
          or(
            isNull(jobApplication.reminderSentAt),
            lte(jobApplication.reminderSentAt, resendThreshold),
          ),
        ),
      );
    const withTags = await this.attachTags(rows);
    return withTags.map((r) => this.toEntity(r));
  }

  async updateReminderSentAt(id: string, sentAt: Date): Promise<void> {
    await this.db
      .update(jobApplication)
      .set({ reminderSentAt: sentAt })
      .where(eq(jobApplication.id, id));
  }

  private toEntity(row: AppRow): Application {
    return {
      id: row.id,
      userId: row.userId,
      company: row.company,
      role: row.role,
      status: row.status as ApplicationStatus,
      jobUrl: row.jobUrl,
      location: row.location,
      salaryRange: row.salaryRange,
      description: row.description,
      appliedAt: row.appliedAt,
      starred: row.starred,
      source: row.source,
      followUpAt: row.followUpAt,
      tags: row.tags,
      reminderSentAt: row.reminderSentAt,
      boardPosition: row.boardPosition,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
