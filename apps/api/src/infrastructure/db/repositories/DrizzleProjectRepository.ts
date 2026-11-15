import { desc, eq } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { project } from '../schema.js';
import type { Project } from '#src/domain/project/Project.js';
import type {
  IProjectRepository,
  CreateProjectData,
  UpdateProjectData,
} from '#src/use-cases/ports/IProjectRepository.js';
import { getClient } from '../transactionContext.js';

type Row = typeof project.$inferSelect;

export class DrizzleProjectRepository implements IProjectRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  async findAllByUserId(userId: string): Promise<Project[]> {
    const rows = await this.db
      .select()
      .from(project)
      .where(eq(project.userId, userId))
      .orderBy(desc(project.startDate), desc(project.createdAt), desc(project.id));
    return rows.map((r) => this.toEntity(r));
  }

  async findById(id: string): Promise<Project | null> {
    const [row] = await this.db.select().from(project).where(eq(project.id, id)).limit(1);
    return row ? this.toEntity(row) : null;
  }

  async create(data: CreateProjectData): Promise<Project> {
    const [row] = await this.db
      .insert(project)
      .values({
        id: data.id,
        userId: data.userId,
        name: data.name,
        role: data.role ?? null,
        url: data.url ?? null,
        startDate: data.startDate ?? null,
        endDate: data.endDate ?? null,
        description: data.description ?? null,
      })
      .returning();
    return this.toEntity(row);
  }

  async update(id: string, data: UpdateProjectData): Promise<Project> {
    const [row] = await this.db.update(project).set(data).where(eq(project.id, id)).returning();
    return this.toEntity(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(project).where(eq(project.id, id));
  }

  private toEntity(row: Row): Project {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      role: row.role,
      url: row.url,
      startDate: row.startDate,
      endDate: row.endDate,
      description: row.description,
      createdAt: row.createdAt,
    };
  }
}
