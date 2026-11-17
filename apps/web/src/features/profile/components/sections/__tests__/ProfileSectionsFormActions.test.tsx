import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentType } from 'react';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));

import { AwardsSection } from '#/features/profile/components/sections/AwardsSection';
import { EducationSection } from '#/features/profile/components/sections/EducationSection';
import { LanguagesSection } from '#/features/profile/components/sections/LanguagesSection';
import { ProjectsSection } from '#/features/profile/components/sections/ProjectsSection';
import { SkillsSection } from '#/features/profile/components/sections/SkillsSection';
import { WorkExperienceSection } from '#/features/profile/components/sections/WorkExperienceSection';

function Wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

interface Case {
  label: string;
  Section: ComponentType;
  createMutation: string;
  /** The inputs the schema requires, by `name`. */
  required: Record<string, string>;
}

const CASES: Case[] = [
  {
    label: 'Awards',
    Section: AwardsSection,
    createMutation: 'createAward',
    required: { title: 'Dean’s list' },
  },
  {
    label: 'Education',
    Section: EducationSection,
    createMutation: 'createEducation',
    required: { institution: 'MIT', startDate: '2018-09-01' },
  },
  {
    label: 'Languages',
    Section: LanguagesSection,
    createMutation: 'createLanguage',
    required: { name: 'French' },
  },
  {
    label: 'Projects',
    Section: ProjectsSection,
    createMutation: 'createProject',
    required: { name: 'Trakwyn' },
  },
  {
    label: 'Skills',
    Section: SkillsSection,
    createMutation: 'createSkill',
    required: { name: 'TypeScript' },
  },
  {
    label: 'Work experience',
    Section: WorkExperienceSection,
    createMutation: 'createWorkExperience',
    required: { company: 'Acme', title: 'Engineer', startDate: '2020-01-01' },
  },
];

function isCreate(query: unknown, createMutation: string) {
  return String(query).includes(createMutation);
}

function openForm() {
  fireEvent.click(screen.getAllByRole('button', { name: /add/i })[0]);
}

function fill(required: Record<string, string>) {
  for (const [name, value] of Object.entries(required)) {
    const input = document.querySelector<HTMLInputElement>(`[name="${name}"]`);
    if (!input) throw new Error(`no input named ${name}`);
    fireEvent.change(input, { target: { value } });
  }
  return document.querySelector<HTMLInputElement>(`[name="${Object.keys(required)[0]}"]`)!;
}

describe.each(CASES)('$label section as a form action (JEF-612)', (testCase) => {
  const { Section, createMutation, required } = testCase;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not send an incomplete form and keeps it open', async () => {
    mockGqlRequest.mockResolvedValue({});
    render(<Section />, { wrapper: Wrapper });
    await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());

    openForm();
    const first = document.querySelector<HTMLInputElement>(`[name="${Object.keys(required)[0]}"]`)!;
    fireEvent.submit(first.closest('form')!);

    expect(await screen.findAllByText('Required')).not.toHaveLength(0);
    expect(mockGqlRequest.mock.calls.some(([q]) => isCreate(q, createMutation))).toBe(false);
  });

  it('is pending while the save runs and sends it once', async () => {
    let finish!: (value: unknown) => void;
    mockGqlRequest.mockImplementation((query: string) => {
      if (isCreate(query, createMutation)) return new Promise((resolve) => (finish = resolve));
      return Promise.resolve({});
    });
    render(<Section />, { wrapper: Wrapper });
    await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());

    openForm();
    const first = fill(required);
    const form = first.closest('form')!;
    fireEvent.submit(form);

    const saving = await within(form).findByRole('button', { name: 'Saving…' });
    expect(saving).toBeDisabled();
    expect(first.value).toBe(required[Object.keys(required)[0]]);

    finish({});
    await waitFor(() => expect(document.querySelector('form')).toBeNull());
    expect(mockGqlRequest.mock.calls.filter(([q]) => isCreate(q, createMutation))).toHaveLength(1);
  });

  it('keeps what was typed when the save fails', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (isCreate(query, createMutation)) {
        return Promise.reject({
          response: {
            errors: [{ message: 'Limit reached', extensions: { code: 'QUOTA_EXCEEDED' } }],
          },
        });
      }
      return Promise.resolve({});
    });
    render(<Section />, { wrapper: Wrapper });
    await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());

    openForm();
    const first = fill(required);
    fireEvent.submit(first.closest('form')!);

    expect(await screen.findByText(/Limit reached/)).toBeInTheDocument();
    expect(
      document.querySelector<HTMLInputElement>(`[name="${Object.keys(required)[0]}"]`)!.value,
    ).toBe(required[Object.keys(required)[0]]);
  });
});
