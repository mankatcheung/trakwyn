import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { INoteRepository } from '#src/use-cases/ports/INoteRepository.js';
import type { IDocumentRepository } from '#src/use-cases/ports/IDocumentRepository.js';
import type {
  IExportUserDataUseCase,
  ExportUserDataOutput,
} from '#src/use-cases/user/IExportUserDataUseCase.js';

interface Deps {
  userRepository: IUserRepository;
  applicationRepository: IApplicationRepository;
  noteRepository: INoteRepository;
  documentRepository: IDocumentRepository;
}

export class ExportUserDataUseCase implements IExportUserDataUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(userId: string): Promise<ExportUserDataOutput> {
    const user = await this.deps.userRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found');

    const applications = await this.deps.applicationRepository.findAllByUserId(userId);

    const exportedApplications = await Promise.all(
      applications.map(async (app) => {
        const [notes, documents] = await Promise.all([
          this.deps.noteRepository.findAllByApplicationId(app.id),
          this.deps.documentRepository.findAllByApplicationId(app.id),
        ]);

        return {
          company: app.company,
          role: app.role,
          status: app.status,
          jobUrl: app.jobUrl,
          location: app.location,
          salaryRange: app.salaryRange,
          description: app.description,
          postingText: app.postingText,
          appliedAt: app.appliedAt ? app.appliedAt.toISOString() : null,
          createdAt: app.createdAt.toISOString(),
          notes: notes.map((n) => ({
            content: n.content,
            createdAt: n.createdAt.toISOString(),
          })),
          documents: documents.map((d) => ({
            name: d.name,
            mimeType: d.mimeType,
            sizeBytes: d.sizeBytes,
            createdAt: d.createdAt.toISOString(),
          })),
        };
      }),
    );

    return {
      exportedAt: new Date().toISOString(),
      user: { email: user.email, createdAt: user.createdAt.toISOString() },
      applications: exportedApplications,
    };
  }
}
