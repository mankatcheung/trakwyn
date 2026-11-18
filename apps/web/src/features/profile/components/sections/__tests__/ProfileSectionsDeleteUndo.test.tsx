import type { ComponentType, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest, mockToast } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockToast: Object.assign(vi.fn(), { error: vi.fn() }),
}));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));
// The real undo toast and its timer run; only the toast UI is stubbed so the
// test can press the Undo action it was opened with.
vi.mock('sonner', () => ({ toast: mockToast }));

import { AwardsSection } from '#/features/profile/components/sections/AwardsSection';
import { CertificationsSection } from '#/features/profile/components/sections/CertificationsSection';
import { EducationSection } from '#/features/profile/components/sections/EducationSection';
import { LanguagesSection } from '#/features/profile/components/sections/LanguagesSection';
import { ProjectsSection } from '#/features/profile/components/sections/ProjectsSection';
import { SkillsSection } from '#/features/profile/components/sections/SkillsSection';
import { WorkExperienceSection } from '#/features/profile/components/sections/WorkExperienceSection';
import { mockGql, respond, respondWith, type GqlResponse } from '#/__tests__/helpers/gqlMock';
import {
  WORK_EXPERIENCES_QUERY,
  DELETE_WORK_EXPERIENCE,
} from '#/features/profile/graphql/workExperienceQueries';
import { EDUCATIONS_QUERY, DELETE_EDUCATION } from '#/features/profile/graphql/educationQueries';
import { SKILLS_QUERY, DELETE_SKILL } from '#/features/profile/graphql/skillQueries';
import {
  CERTIFICATIONS_QUERY,
  DELETE_CERTIFICATION,
} from '#/features/profile/graphql/certificationQueries';
import { LANGUAGES_QUERY, DELETE_LANGUAGE } from '#/features/profile/graphql/languageQueries';
import { PROJECTS_QUERY, DELETE_PROJECT } from '#/features/profile/graphql/projectQueries';
import { AWARDS_QUERY, DELETE_AWARD } from '#/features/profile/graphql/awardQueries';
import { gqlText } from '#/__tests__/helpers/gqlText';

const UNDO_WINDOW_MS = 5000;
const CREATED_AT = '2024-01-01T00:00:00.000Z';

interface SectionCase {
  name: string;
  Section: ComponentType;
  /** The delete mutation's field in the document. */
  deleteField: string;
  /** Text only this row renders. */
  text: RegExp;
  row: { id: string } & Record<string, unknown>;
  /** Answers the section's list query (empty once deleted) and its delete mutation. */
  serve: (isDeleted: () => boolean, onDelete: () => void) => GqlResponse[];
}

/** One section, typed by its own row: `serve` gets the rows still listed. */
function caseOf<Row extends { id: string }>(c: {
  name: string;
  Section: ComponentType;
  deleteField: string;
  row: Row;
  text: RegExp;
  serve: (rows: () => Row[], onDelete: () => void) => GqlResponse[];
}): SectionCase {
  return {
    name: c.name,
    Section: c.Section,
    deleteField: c.deleteField,
    text: c.text,
    row: c.row,
    serve: (isDeleted, onDelete) => c.serve(() => (isDeleted() ? [] : [c.row]), onDelete),
  };
}

const CASES: SectionCase[] = [
  caseOf({
    name: 'WorkExperienceSection',
    Section: WorkExperienceSection,
    deleteField: 'deleteWorkExperience',
    row: {
      id: 'w1',
      company: 'Zeta Labs',
      title: 'Staff Engineer',
      location: null,
      startDate: '2020-01-01T00:00:00.000Z',
      endDate: null,
      description: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
    text: /Zeta Labs/,
    serve: (rows, onDelete) => [
      respond(WORK_EXPERIENCES_QUERY, () => ({ workExperiences: rows() })),
      respondWith(DELETE_WORK_EXPERIENCE, async () => {
        onDelete();
        return { deleteWorkExperience: true };
      }),
    ],
  }),
  caseOf({
    name: 'EducationSection',
    Section: EducationSection,
    deleteField: 'deleteEducation',
    row: {
      id: 'e1',
      institution: 'Northfield University',
      degree: 'BSc',
      field: 'Physics',
      startDate: '2014-09-01T00:00:00.000Z',
      endDate: '2018-06-01T00:00:00.000Z',
      description: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
    text: /Northfield University/,
    serve: (rows, onDelete) => [
      respond(EDUCATIONS_QUERY, () => ({ educations: rows() })),
      respondWith(DELETE_EDUCATION, async () => {
        onDelete();
        return { deleteEducation: true };
      }),
    ],
  }),
  caseOf({
    name: 'SkillsSection',
    Section: SkillsSection,
    deleteField: 'deleteSkill',
    row: { id: 's1', name: 'Rustacean', category: null, proficiency: null, createdAt: CREATED_AT },
    text: /Rustacean/,
    serve: (rows, onDelete) => [
      respond(SKILLS_QUERY, () => ({ skills: rows() })),
      respondWith(DELETE_SKILL, async () => {
        onDelete();
        return { deleteSkill: true };
      }),
    ],
  }),
  caseOf({
    name: 'CertificationsSection',
    Section: CertificationsSection,
    deleteField: 'deleteCertification',
    row: {
      id: 'c1',
      name: 'Certified Kubernetes Admin',
      issuer: null,
      issuedAt: null,
      expiresAt: null,
      credentialUrl: null,
      createdAt: CREATED_AT,
    },
    text: /Certified Kubernetes Admin/,
    serve: (rows, onDelete) => [
      respond(CERTIFICATIONS_QUERY, () => ({ certifications: rows() })),
      respondWith(DELETE_CERTIFICATION, async () => {
        onDelete();
        return { deleteCertification: true };
      }),
    ],
  }),
  caseOf({
    name: 'LanguagesSection',
    Section: LanguagesSection,
    deleteField: 'deleteLanguage',
    row: { id: 'l1', name: 'Esperanto', proficiency: 'Fluent', createdAt: CREATED_AT },
    text: /Esperanto/,
    serve: (rows, onDelete) => [
      respond(LANGUAGES_QUERY, () => ({ languages: rows() })),
      respondWith(DELETE_LANGUAGE, async () => {
        onDelete();
        return { deleteLanguage: true };
      }),
    ],
  }),
  caseOf({
    name: 'ProjectsSection',
    Section: ProjectsSection,
    deleteField: 'deleteProject',
    row: {
      id: 'p1',
      name: 'Lighthouse CLI',
      role: null,
      url: null,
      startDate: null,
      endDate: null,
      description: null,
      createdAt: CREATED_AT,
    },
    text: /Lighthouse CLI/,
    serve: (rows, onDelete) => [
      respond(PROJECTS_QUERY, () => ({ projects: rows() })),
      respondWith(DELETE_PROJECT, async () => {
        onDelete();
        return { deleteProject: true };
      }),
    ],
  }),
  caseOf({
    name: 'AwardsSection',
    Section: AwardsSection,
    deleteField: 'deleteAward',
    row: {
      id: 'a1',
      title: 'Hackathon Grand Prize',
      issuer: null,
      date: null,
      description: null,
      createdAt: CREATED_AT,
    },
    text: /Hackathon Grand Prize/,
    serve: (rows, onDelete) => [
      respond(AWARDS_QUERY, () => ({ awards: rows() })),
      respondWith(DELETE_AWARD, async () => {
        onDelete();
        return { deleteAward: true };
      }),
    ],
  }),
];

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Delete requests the section sent, as `[document, variables]` pairs. */
const deleteCalls = (deleteField: string) =>
  mockGqlRequest.mock.calls.filter(([document]) => gqlText(document).includes(deleteField));

describe.each(CASES)('$name: delete with undo (JEF-625)', (c) => {
  let deleted = false;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.clear();
    mockGqlRequest.mockReset();
    mockToast.mockReset();
    deleted = false;
    mockGql(
      mockGqlRequest,
      c.serve(
        () => deleted,
        () => {
          deleted = true;
        },
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function openAndDelete() {
    render(<c.Section />, { wrapper: Wrapper });
    await screen.findAllByText(c.text);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    // Query Cache subscribers are notified on a zero-delay timer, which fake
    // timers hold back; this is the next tick, not the undo window.
    await act(() => vi.advanceTimersByTimeAsync(0));
  }

  it('removes the row at once and offers undo, without sending the request yet', async () => {
    await openAndDelete();

    expect(screen.queryByText(c.text)).not.toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith(
      'Deleted from your profile',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }),
    );
    expect(deleteCalls(c.deleteField)).toHaveLength(0);
  });

  it('sends the delete once when the undo window closes', async () => {
    await openAndDelete();

    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));

    const calls = deleteCalls(c.deleteField);
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual({ id: c.row.id });
    expect(screen.queryByText(c.text)).not.toBeInTheDocument();
  });

  it('brings the row back on undo and never sends the request', async () => {
    await openAndDelete();

    const { action } = mockToast.mock.calls[0][1] as { action: { onClick: () => void } };
    act(() => action.onClick());
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));

    expect(screen.getAllByText(c.text).length).toBeGreaterThan(0);
    expect(deleteCalls(c.deleteField)).toHaveLength(0);
  });
});
