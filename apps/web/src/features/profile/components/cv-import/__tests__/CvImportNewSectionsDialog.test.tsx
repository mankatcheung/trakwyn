import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest, mockUploadCv, mockToastSuccess } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockUploadCv: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
  CV_IMPORT_URL: 'http://api.test/profile/cv-import',
  traceHeaders: () => ({}),
}));

vi.mock('sonner', () => ({ toast: { success: mockToastSuccess } }));

vi.mock('#/features/profile/lib/cvImport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/features/profile/lib/cvImport')>()),
  uploadCv: mockUploadCv,
}));

vi.mock('#/features/ai/hooks/useAiCredits', () => ({
  useAiCredits: () => ({
    onTrakwynAi: false,
    needsSetup: false,
    view: null,
    costOf: () => null,
    canAfford: () => true,
    refresh: () => Promise.resolve(),
  }),
}));
vi.mock('#/features/ai/components/AiCreditsMeter', () => ({ AiCreditsMeter: () => null }));

import { CvImportDialog } from '#/features/profile/components/cv-import/CvImportDialog';
import type { ParsedCvProfile } from '#/features/profile/lib/cvImport';

const parsed: ParsedCvProfile = {
  workExperiences: [],
  educations: [],
  skills: [],
  certifications: [
    {
      name: 'CKA',
      issuer: 'CNCF',
      issuedAt: '2023-05',
      expiresAt: null,
      credentialUrl: null,
      alreadyInProfile: false,
    },
  ],
  languages: [{ name: 'French', proficiency: 'Fluent', alreadyInProfile: false }],
  projects: [
    {
      name: 'Open-source CLI',
      role: 'Maintainer',
      url: null,
      startDate: '2021-03',
      endDate: null,
      description: 'Built it.',
      alreadyInProfile: false,
    },
  ],
  awards: [
    {
      title: 'Engineering Excellence Award',
      issuer: 'Acme',
      date: '2022-06',
      description: null,
      alreadyInProfile: true,
    },
  ],
  truncated: false,
};

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <CvImportDialog open onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose, invalidate };
}

async function openReview() {
  mockUploadCv.mockResolvedValue(parsed);
  const view = renderDialog();
  fireEvent.change(screen.getByTestId('cv-import-input'), {
    target: { files: [new File(['%PDF-1.7'], 'cv.pdf', { type: 'application/pdf' })] },
  });
  await screen.findByText('Projects');
  return view;
}

describe('CvImportDialog with certifications, languages, projects and awards (JEF-592)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGqlRequest.mockResolvedValue({
      importCvProfile: {
        workExperiences: 0,
        educations: 0,
        skills: 0,
        certifications: 1,
        languages: 1,
        projects: 1,
        awards: 0,
      },
    });
  });

  it('lists each new section under its heading, and badges what the profile already has', async () => {
    await openReview();

    for (const heading of ['Projects', 'Certifications', 'Awards', 'Languages']) {
      expect(screen.getByRole('heading', { name: new RegExp(heading) })).toBeInTheDocument();
    }
    expect(screen.getByText('Open-source CLI')).toBeInTheDocument();
    expect(screen.getByText('Maintainer · Mar 2021 – Present')).toBeInTheDocument();
    expect(screen.getByText('CNCF · May 2023')).toBeInTheDocument();
    expect(screen.getByText('Fluent', { exact: false })).toBeInTheDocument();
    const award = screen
      .getByRole('checkbox', { name: 'Include Engineering Excellence Award' })
      .closest('li')!;
    expect(award).toHaveTextContent('Already in your profile');
    expect(
      screen.getByRole('checkbox', { name: 'Include Engineering Excellence Award' }),
    ).not.toBeChecked();
  });

  it('sends the ticked rows of the new sections, refreshes their lists and says what was added', async () => {
    const { onClose, invalidate } = await openReview();

    fireEvent.click(screen.getByRole('button', { name: 'Import 3 selected' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [document, variables] = mockGqlRequest.mock.calls[0]!;
    expect(document).toContain('importCvProfile');
    expect(variables.input).toMatchObject({
      certifications: [{ name: 'CKA', issuer: 'CNCF', issuedAt: '2023-05' }],
      languages: [{ name: 'French', proficiency: 'Fluent' }],
      projects: [{ name: 'Open-source CLI', role: 'Maintainer', startDate: '2021-03' }],
    });
    // The award was already in the profile, so it starts unticked and is not sent.
    expect(variables.input).not.toHaveProperty('awards');
    for (const key of ['certifications', 'languages', 'projects', 'awards']) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
    }
    expect(mockToastSuccess).toHaveBeenCalledWith(
      'Added from your CV: 0 work experience, 0 education, 0 skills and 3 certifications, languages, projects and awards.',
    );
  });

  it('blocks Import while a ticked row of a new section is invalid', async () => {
    await openReview();
    const row = screen.getByRole('checkbox', { name: 'Include French' }).closest('li')!;

    fireEvent.click(row.querySelector('button')!);
    fireEvent.change(screen.getByLabelText('Language *'), { target: { value: '' } });

    expect(screen.getByRole('button', { name: /^Import \d+ selected$/ })).toBeDisabled();
    expect(
      screen.getByText('Fix the highlighted rows, or untick them, to continue.'),
    ).toBeInTheDocument();
  });
});
