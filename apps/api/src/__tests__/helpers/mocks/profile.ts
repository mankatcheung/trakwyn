/**
 * Test doubles for the profile domain.
 *
 * One of the per-domain modules split out of the former 816-line
 * `helpers/mocks.ts` (JEF-254), which held all 68 factories together and was
 * imported by 157 test files.
 */

import { vi } from 'vitest';
import type { Education } from '#src/domain/education/Education.js';
import type { IEducationRepository } from '#src/use-cases/ports/IEducationRepository.js';
import type { ISkillRepository } from '#src/use-cases/ports/ISkillRepository.js';
import type { IWorkExperienceRepository } from '#src/use-cases/ports/IWorkExperienceRepository.js';
import type { Skill } from '#src/domain/skill/Skill.js';
import type { Certification } from '#src/domain/certification/Certification.js';
import type { Language } from '#src/domain/language/Language.js';
import type { ICertificationRepository } from '#src/use-cases/ports/ICertificationRepository.js';
import type { ILanguageRepository } from '#src/use-cases/ports/ILanguageRepository.js';
import type { WorkExperience } from '#src/domain/workExperience/WorkExperience.js';

export const makeWorkExperienceRepository = (
  overrides?: Partial<IWorkExperienceRepository>,
): IWorkExperienceRepository => ({
  findAllByUserId: vi.fn().mockResolvedValue([]),
  findById: vi.fn().mockResolvedValue(null),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  ...overrides,
});

export const makeEducationRepository = (
  overrides?: Partial<IEducationRepository>,
): IEducationRepository => ({
  findAllByUserId: vi.fn().mockResolvedValue([]),
  findById: vi.fn().mockResolvedValue(null),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  ...overrides,
});

export const makeSkillRepository = (overrides?: Partial<ISkillRepository>): ISkillRepository => ({
  findAllByUserId: vi.fn().mockResolvedValue([]),
  findById: vi.fn().mockResolvedValue(null),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  ...overrides,
});

export const makeWorkExperience = (overrides?: Partial<WorkExperience>): WorkExperience => ({
  id: 'we-1',
  userId: 'user-1',
  company: 'Acme Corp',
  title: 'Software Engineer',
  location: 'San Francisco, CA',
  startDate: new Date('2020-01-01'),
  endDate: new Date('2023-01-01'),
  description: 'Built scalable web applications.',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const makeEducation = (overrides?: Partial<Education>): Education => ({
  id: 'edu-1',
  userId: 'user-1',
  institution: 'UC Berkeley',
  degree: 'B.S.',
  field: 'Computer Science',
  startDate: new Date('2016-09-01'),
  endDate: new Date('2020-05-15'),
  description: 'Graduated with honors.',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const makeSkill = (overrides?: Partial<Skill>): Skill => ({
  id: 'skill-1',
  userId: 'user-1',
  name: 'TypeScript',
  category: 'Language',
  proficiency: 'expert',
  createdAt: new Date('2024-01-01'),
  ...overrides,
});

export const makeCertificationRepository = (
  overrides?: Partial<ICertificationRepository>,
): ICertificationRepository => ({
  findAllByUserId: vi.fn().mockResolvedValue([]),
  findById: vi.fn().mockResolvedValue(null),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  ...overrides,
});

export const makeLanguageRepository = (
  overrides?: Partial<ILanguageRepository>,
): ILanguageRepository => ({
  findAllByUserId: vi.fn().mockResolvedValue([]),
  findById: vi.fn().mockResolvedValue(null),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  ...overrides,
});

export const makeCertification = (overrides?: Partial<Certification>): Certification => ({
  id: 'cert-1',
  userId: 'user-1',
  name: 'AWS Certified Solutions Architect',
  issuer: 'Amazon Web Services',
  issuedAt: new Date('2022-03-01T00:00:00Z'),
  expiresAt: null,
  credentialUrl: null,
  createdAt: new Date('2024-01-01'),
  ...overrides,
});

export const makeLanguage = (overrides?: Partial<Language>): Language => ({
  id: 'lang-1',
  userId: 'user-1',
  name: 'French',
  proficiency: 'Fluent',
  createdAt: new Date('2024-01-01'),
  ...overrides,
});
