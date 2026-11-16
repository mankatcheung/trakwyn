import type { ResumeContent } from '#src/domain/resume/ResumeContent.js';
import { AiResponseInvalidError } from '#src/use-cases/errors/DomainError.js';
import { nameKey } from '#src/use-cases/resume/nameKey.js';
import type { UserProfile } from '#src/use-cases/shared/userProfile.js';

/**
 * Every employer and institution in the output must be one the user entered.
 *
 * A model that adds a job is not producing a worse draft, it is producing a
 * document that is harmful to send — so this refuses rather than filtering the
 * invented entries out, which would hand back a plausible resume with no sign
 * anything had gone wrong.
 */
export function assertGrounded(resume: ResumeContent, profile: UserProfile): void {
  const keys = (names: readonly string[]) => new Set(names.map(nameKey));
  const companies = keys(profile.workExperiences.map((w) => w.company));
  const institutions = keys(profile.educations.map((e) => e.institution));
  const certifications = keys(profile.certifications.map((c) => c.name));
  const languages = keys(profile.languages.map((l) => l.name));
  const projects = keys(profile.projects.map((p) => p.name));
  const awards = keys(profile.awards.map((a) => a.title));

  const unknown = (names: readonly string[], known: Set<string>) =>
    names.filter((name) => !known.has(nameKey(name)));
  const invented = [
    ...unknown(
      resume.experience.map((e) => e.company),
      companies,
    ),
    ...unknown(
      resume.education.map((e) => e.institution),
      institutions,
    ),
    ...unknown(
      (resume.certifications ?? []).map((c) => c.name),
      certifications,
    ),
    ...unknown(
      (resume.languages ?? []).map((l) => l.name),
      languages,
    ),
    ...unknown(
      (resume.projects ?? []).map((p) => p.name),
      projects,
    ),
    ...unknown(
      (resume.awards ?? []).map((a) => a.title),
      awards,
    ),
  ];

  if (invented.length > 0) {
    const named = invented
      .slice(0, 3)
      .map((name) => `"${name.slice(0, 80)}"`)
      .join(', ');
    throw new AiResponseInvalidError(
      `The AI produced a resume containing experience you have not recorded (${named}) — nothing was saved. Please try again.`,
    );
  }
}
