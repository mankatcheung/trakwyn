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
import { gqlText } from '#/__tests__/helpers/gqlText';

const UNDO_WINDOW_MS = 5000;
const CREATED_AT = '2024-01-01T00:00:00.000Z';

interface SectionCase {
  name: string;
  Section: ComponentType;
  /** Name of the list query in the document, and the field it returns. */
  query: string;
  field: string;
  /** The delete mutation's field in the document. */
  deleteField: string;
  row: { id: string } & Record<string, unknown>;
  /** Text only this row renders. */
  text: RegExp;
}

const CASES: SectionCase[] = [
  {
    name: 'WorkExperienceSection',
    Section: WorkExperienceSection,
    query: 'query WorkExperiences',
    field: 'workExperiences',
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
  },
  {
    name: 'EducationSection',
    Section: EducationSection,
    query: 'query Educations',
    field: 'educations',
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
  },
  {
    name: 'SkillsSection',
    Section: SkillsSection,
    query: 'query Skills',
    field: 'skills',
    deleteField: 'deleteSkill',
    row: { id: 's1', name: 'Rustacean', category: null, proficiency: null, createdAt: CREATED_AT },
    text: /Rustacean/,
  },
  {
    name: 'CertificationsSection',
    Section: CertificationsSection,
    query: 'query Certifications',
    field: 'certifications',
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
  },
  {
    name: 'LanguagesSection',
    Section: LanguagesSection,
    query: 'query Languages',
    field: 'languages',
    deleteField: 'deleteLanguage',
    row: { id: 'l1', name: 'Esperanto', proficiency: 'Fluent', createdAt: CREATED_AT },
    text: /Esperanto/,
  },
  {
    name: 'ProjectsSection',
    Section: ProjectsSection,
    query: 'query Projects',
    field: 'projects',
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
  },
  {
    name: 'AwardsSection',
    Section: AwardsSection,
    query: 'query Awards',
    field: 'awards',
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
  },
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
    mockGqlRequest.mockImplementation((document: string) => {
      if (gqlText(document).includes(c.query))
        return Promise.resolve({ [c.field]: deleted ? [] : [c.row] });
      if (gqlText(document).includes(c.deleteField)) {
        deleted = true;
        return Promise.resolve({ [c.deleteField]: true });
      }
      return Promise.resolve({});
    });
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
