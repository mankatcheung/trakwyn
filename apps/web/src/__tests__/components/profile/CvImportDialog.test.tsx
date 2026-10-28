import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
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

// The real file checks and error class; only the network call is replaced.
vi.mock('#/lib/cvImport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/cvImport')>()),
  uploadCv: mockUploadCv,
}));

import { CvImportDialog } from '#/routes/_authenticated/profile/-components/CvImportDialog';
import { CV_IMPORT_MAX_BYTES, CvImportError, type ParsedCvProfile } from '#/lib/cvImport';

const parsed = (overrides: Partial<ParsedCvProfile> = {}): ParsedCvProfile => ({
  workExperiences: [
    {
      company: 'Acme',
      title: 'Engineer',
      location: 'Remote',
      startDate: '2020-03',
      endDate: null,
      description: 'Built things.',
      alreadyInProfile: false,
    },
    {
      company: 'Globex',
      title: 'Developer',
      location: null,
      startDate: '2018-01',
      endDate: '2020-02',
      description: null,
      alreadyInProfile: true,
    },
  ],
  educations: [
    {
      institution: 'UC Berkeley',
      degree: 'B.S.',
      field: 'Computer Science',
      startDate: '2012-09',
      endDate: '2016-05',
      description: null,
      alreadyInProfile: false,
    },
  ],
  skills: [
    { name: 'TypeScript', category: 'Language', proficiency: 'expert', alreadyInProfile: false },
    { name: 'Go', category: null, proficiency: null, alreadyInProfile: false },
  ],
  truncated: false,
  ...overrides,
});

const pdf = (name = 'cv.pdf') => new File(['%PDF-1.7'], name, { type: 'application/pdf' });

function oversized(): File {
  const file = pdf('big.pdf');
  Object.defineProperty(file, 'size', { value: CV_IMPORT_MAX_BYTES + 1 });
  return file;
}

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderDialog(props: { open?: boolean; onClose?: () => void } = {}) {
  const client = makeClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const onClose = props.onClose ?? vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <CvImportDialog open={props.open ?? true} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { ...view, onClose, invalidate };
}

// fireEvent, not userEvent.upload: user-event drops a file the input's `accept`
// rules out, and a wrong file reaching the handler (a drop, a changed filter)
// is exactly what these tests are about.
const choose = (file: File) =>
  fireEvent.change(screen.getByTestId('cv-import-input'), { target: { files: [file] } });

const rowOf = (name: string) =>
  screen.getByRole('checkbox', { name: `Include ${name}` }).closest('li')!;

async function openReview(result: ParsedCvProfile = parsed()) {
  mockUploadCv.mockResolvedValue(result);
  const view = renderDialog();
  choose(pdf());
  await screen.findByText('Work Experience');
  return view;
}

describe('CvImportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGqlRequest.mockResolvedValue({
      importCvProfile: { workExperiences: 1, educations: 1, skills: 2 },
    });
  });

  it('renders nothing while closed', () => {
    renderDialog({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  describe('choosing a file', () => {
    it('says what it takes, how big, and what happens to the file', () => {
      renderDialog();

      expect(screen.getByRole('dialog', { name: 'Import from your CV' })).toBeInTheDocument();
      expect(screen.getByText('PDF, DOCX or TXT, up to 10 MB')).toBeInTheDocument();
      expect(screen.getByText(/Trakwyn does not save it/)).toBeInTheDocument();
    });

    it('offers only the formats the API reads', () => {
      renderDialog();
      const accept = screen.getByTestId('cv-import-input').getAttribute('accept')!.split(',');
      expect(accept).toEqual(expect.arrayContaining(['.pdf', '.docx', '.txt']));
      expect(accept).not.toContain('.doc');
    });

    it.each([
      ['a picture', new File(['x'], 'me.png', { type: 'image/png' }), /PDF, DOCX or TXT file/],
      ['a web page', new File(['x'], 'cv.html', { type: 'text/html' }), /PDF, DOCX or TXT file/],
      [
        'an old Word file',
        new File(['x'], 'cv.doc', { type: 'application/msword' }),
        /Old Word \.doc files aren't supported/,
      ],
      ['an empty file', new File([], 'cv.pdf', { type: 'application/pdf' }), /That file is empty/],
    ])('turns away %s without sending anything', (_what, file, message) => {
      renderDialog();

      choose(file);

      expect(screen.getByRole('alert')).toHaveTextContent(message);
      expect(mockUploadCv).not.toHaveBeenCalled();
      expect(screen.getByTestId('cv-import-input')).toBeInTheDocument();
    });

    it('turns away a file over the limit without sending anything', () => {
      renderDialog();

      choose(oversized());

      expect(screen.getByRole('alert')).toHaveTextContent('That file is larger than 10 MB.');
      expect(mockUploadCv).not.toHaveBeenCalled();
    });

    it('lets the user pick again after a refusal', async () => {
      mockUploadCv.mockResolvedValue(parsed());
      renderDialog();
      choose(new File(['x'], 'me.png', { type: 'image/png' }));
      expect(screen.getByRole('alert')).toBeInTheDocument();

      choose(pdf());

      await screen.findByText('Work Experience');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('accepts a file dropped on the drop zone', async () => {
      mockUploadCv.mockResolvedValue(parsed());
      renderDialog();

      fireEvent.drop(screen.getByText('Drop your CV here, or choose a file'), {
        dataTransfer: { files: [pdf('dropped.pdf')] },
      });

      await screen.findByText('Work Experience');
      expect(mockUploadCv).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'dropped.pdf' }),
        expect.any(AbortSignal),
      );
    });
  });

  describe('reading the file', () => {
    it('shows the file being read, and cancelling stops the request', async () => {
      let signal: AbortSignal | undefined;
      mockUploadCv.mockImplementation((_file: File, s: AbortSignal) => {
        signal = s;
        return new Promise(() => {});
      });
      renderDialog();

      choose(pdf('Jane CV.pdf'));

      expect(await screen.findByText('Reading Jane CV.pdf…')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(signal!.aborted).toBe(true);
      expect(screen.getByTestId('cv-import-input')).toBeInTheDocument();
    });

    it('stops the request when the dialog is closed mid-read', async () => {
      let signal: AbortSignal | undefined;
      mockUploadCv.mockImplementation((_file: File, s: AbortSignal) => {
        signal = s;
        return new Promise(() => {});
      });
      const { onClose } = renderDialog();
      choose(pdf());
      await screen.findByText(/Reading/);

      fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      expect(signal!.aborted).toBe(true);
      expect(onClose).toHaveBeenCalled();
    });

    it('does not show a late answer for a read that was cancelled', async () => {
      let resolve: (value: ParsedCvProfile) => void = () => {};
      mockUploadCv.mockImplementation(() => new Promise<ParsedCvProfile>((r) => (resolve = r)));
      renderDialog();
      choose(pdf());
      await screen.findByText(/Reading/);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      resolve(parsed());
      await Promise.resolve();

      expect(screen.queryByText('Work Experience')).not.toBeInTheDocument();
    });

    it("shows the API's own message when it refuses the file", async () => {
      mockUploadCv.mockRejectedValue(
        new CvImportError('The file is larger than 10 MB', 'VALIDATION'),
      );
      renderDialog();

      choose(pdf());

      expect(await screen.findByRole('alert')).toHaveTextContent('The file is larger than 10 MB');
      expect(screen.getByTestId('cv-import-input')).toBeInTheDocument();
    });

    it('points to Settings when there is no AI key', async () => {
      mockUploadCv.mockRejectedValue(
        new CvImportError(
          'Add your AI API key in Settings to use this feature',
          'AI_NOT_CONFIGURED',
        ),
      );
      renderDialog();

      choose(pdf());

      const alert = await screen.findByRole('alert');
      expect(within(alert).getByRole('link')).toHaveAttribute('href', '/settings/ai');
    });

    it('shows the rate limit message as it came', async () => {
      mockUploadCv.mockRejectedValue(
        new CvImportError('Too many requests — please wait a moment and try again', 'RATE_LIMITED'),
      );
      renderDialog();

      choose(pdf());

      expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
    });

    it('falls back to a plain message when the API gave none', async () => {
      mockUploadCv.mockRejectedValue(new CvImportError('', 'INTERNAL_ERROR'));
      renderDialog();

      choose(pdf());

      expect(await screen.findByRole('alert')).toHaveTextContent(
        "We couldn't read your CV. Please try again.",
      );
    });

    it('falls back to a plain message on a network failure', async () => {
      mockUploadCv.mockRejectedValue(new TypeError('Failed to fetch'));
      renderDialog();

      choose(pdf());

      expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't read your CV");
    });

    it('says so when the file held nothing to import', async () => {
      mockUploadCv.mockResolvedValue(parsed({ workExperiences: [], educations: [], skills: [] }));
      renderDialog();

      choose(pdf());

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /couldn't find any experience, education or skills/,
      );
      expect(screen.getByTestId('cv-import-input')).toBeInTheDocument();
    });
  });

  describe('reviewing', () => {
    it('lists what was found under the three headings', async () => {
      await openReview();

      expect(screen.getByText('Work Experience')).toBeInTheDocument();
      expect(screen.getByText('Education')).toBeInTheDocument();
      expect(screen.getByText('Skills')).toBeInTheDocument();
      expect(screen.getByText('Engineer at Acme')).toBeInTheDocument();
      expect(screen.getByText('UC Berkeley')).toBeInTheDocument();
      expect(screen.getByText('TypeScript')).toBeInTheDocument();
    });

    it('ticks what is new and leaves unticked, with a badge, what the profile already has', async () => {
      await openReview();

      expect(screen.getByRole('checkbox', { name: 'Include Engineer at Acme' })).toBeChecked();
      const known = screen.getByRole('checkbox', { name: 'Include Developer at Globex' });
      expect(known).not.toBeChecked();
      expect(
        within(rowOf('Developer at Globex')).getByText('Already in your profile'),
      ).toBeVisible();
    });

    it('counts the ticked rows on the Import button and in each heading', async () => {
      await openReview();

      expect(screen.getByRole('button', { name: 'Import 4 selected' })).toBeEnabled();
      expect(screen.getByText('1/2')).toBeInTheDocument();
    });

    it('updates the count as rows are ticked and unticked', async () => {
      await openReview();

      fireEvent.click(screen.getByRole('checkbox', { name: 'Include TypeScript' }));
      expect(screen.getByRole('button', { name: 'Import 3 selected' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('checkbox', { name: 'Include Developer at Globex' }));
      expect(screen.getByRole('button', { name: 'Import 4 selected' })).toBeInTheDocument();
    });

    it('disables Import when nothing is ticked', async () => {
      await openReview();

      for (const name of ['Engineer at Acme', 'UC Berkeley', 'TypeScript', 'Go']) {
        fireEvent.click(screen.getByRole('checkbox', { name: `Include ${name}` }));
      }

      expect(screen.getByRole('button', { name: 'Import 0 selected' })).toBeDisabled();
    });

    it('ticks or unticks a whole section from its heading', async () => {
      await openReview();
      const skills = screen.getByRole('region', { name: /Skills/ });

      fireEvent.click(within(skills).getByRole('button', { name: 'Select none' }));
      expect(within(skills).queryAllByRole('checkbox', { checked: true })).toHaveLength(0);

      fireEvent.click(within(skills).getByRole('button', { name: 'Select all' }));
      expect(within(skills).getAllByRole('checkbox', { checked: true })).toHaveLength(2);
    });

    it('warns when the CV was too long to read in full', async () => {
      await openReview(parsed({ truncated: true }));
      expect(screen.getByRole('status')).toHaveTextContent(/entries near the end may be missing/);
    });

    it('does not warn for a CV that fitted', async () => {
      await openReview();
      expect(screen.queryByText(/entries near the end may be missing/)).not.toBeInTheDocument();
    });

    it('goes back to the picker to choose another file', async () => {
      await openReview();

      fireEvent.click(screen.getByRole('button', { name: 'Choose a different file' }));

      expect(screen.getByTestId('cv-import-input')).toBeInTheDocument();
      expect(screen.queryByText('Work Experience')).not.toBeInTheDocument();
    });
  });

  describe('editing a row', () => {
    it('opens the fields for that row, filled in, and closes them again', async () => {
      await openReview();
      const row = rowOf('Engineer at Acme');

      fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));

      expect(within(row).getByLabelText('Company *')).toHaveValue('Acme');
      expect(within(row).getByLabelText('Title *')).toHaveValue('Engineer');
      expect(within(row).getByLabelText('Start Date *')).toHaveValue('2020-03');
      expect(within(row).getByLabelText('End Date')).toHaveValue('');
      fireEvent.click(within(row).getByRole('button', { name: 'Done' }));
      expect(within(row).queryByLabelText('Company *')).not.toBeInTheDocument();
    });

    it('sends the edited value, not what was read', async () => {
      await openReview();
      const row = rowOf('Engineer at Acme');
      fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));

      fireEvent.change(within(row).getByLabelText('Title *'), {
        target: { value: 'Staff Engineer' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^Import \d+ selected$/ }));

      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
      const [, variables] = mockGqlRequest.mock.calls[0]!;
      expect(variables.input.workExperiences[0]).toMatchObject({
        company: 'Acme',
        title: 'Staff Engineer',
      });
    });

    it('lets the proficiency be one of the four levels', async () => {
      await openReview();
      const row = rowOf('Go');
      fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));

      fireEvent.change(within(row).getByLabelText('Proficiency'), {
        target: { value: 'advanced' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^Import \d+ selected$/ }));

      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
      const skills = mockGqlRequest.mock.calls[0]![1].input.skills;
      expect(skills).toContainEqual(
        expect.objectContaining({ name: 'Go', proficiency: 'advanced' }),
      );
    });

    it('blocks Import while a ticked row is invalid, and says why', async () => {
      await openReview();
      const row = rowOf('Engineer at Acme');
      fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));

      fireEvent.change(within(row).getByLabelText('Title *'), { target: { value: '  ' } });

      expect(screen.getByRole('button', { name: /^Import \d+ selected$/ })).toBeDisabled();
      expect(screen.getByText(/Fix the highlighted rows/)).toBeInTheDocument();
    });

    it('blocks Import for an end date before the start', async () => {
      await openReview();
      const row = rowOf('Engineer at Acme');
      fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));

      fireEvent.change(within(row).getByLabelText('End Date'), { target: { value: '2019-01' } });

      expect(screen.getByRole('button', { name: /^Import \d+ selected$/ })).toBeDisabled();
    });

    it('lets the user off the hook by unticking the invalid row', async () => {
      await openReview();
      const row = rowOf('Engineer at Acme');
      fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
      fireEvent.change(within(row).getByLabelText('Title *'), { target: { value: '' } });

      fireEvent.click(within(row).getByRole('checkbox'));

      expect(screen.getByRole('button', { name: 'Import 3 selected' })).toBeEnabled();
      expect(screen.queryByText(/Fix the highlighted rows/)).not.toBeInTheDocument();
    });
  });

  describe('importing', () => {
    it('sends only the ticked rows, then refreshes the profile and closes', async () => {
      const { onClose, invalidate } = await openReview();
      fireEvent.click(screen.getByRole('checkbox', { name: 'Include Go' }));

      fireEvent.click(screen.getByRole('button', { name: 'Import 3 selected' }));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(mockGqlRequest).toHaveBeenCalledTimes(1);
      const [document, variables] = mockGqlRequest.mock.calls[0]!;
      expect(document).toContain('importCvProfile');
      expect(variables).toEqual({
        input: {
          workExperiences: [
            {
              company: 'Acme',
              title: 'Engineer',
              location: 'Remote',
              startDate: '2020-03',
              endDate: undefined,
              description: 'Built things.',
            },
          ],
          educations: [
            {
              institution: 'UC Berkeley',
              degree: 'B.S.',
              field: 'Computer Science',
              startDate: '2012-09',
              endDate: '2016-05',
              description: undefined,
            },
          ],
          skills: [{ name: 'TypeScript', category: 'Language', proficiency: 'expert' }],
        },
      });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['workExperiences'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['educations'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['skills'] });
    });

    it('tells the user what was added', async () => {
      const { onClose } = await openReview();

      fireEvent.click(screen.getByRole('button', { name: /^Import \d+ selected$/ }));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(mockToastSuccess).toHaveBeenCalledWith(
        'Added from your CV: 1 work experience, 1 education, 2 skills.',
      );
    });

    it("stays open with the user's ticks and edits when saving fails", async () => {
      mockGqlRequest.mockRejectedValue(new Error('network down'));
      const { onClose } = await openReview();
      fireEvent.click(screen.getByRole('checkbox', { name: 'Include Go' }));

      fireEvent.click(screen.getByRole('button', { name: 'Import 3 selected' }));

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('checkbox', { name: 'Include Go' })).not.toBeChecked();
      expect(screen.getByRole('button', { name: 'Import 3 selected' })).toBeEnabled();
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });

    it('locks the review while saving, and ignores a close until it is done', async () => {
      let finish: (value: unknown) => void = () => {};
      mockGqlRequest.mockImplementation(() => new Promise((r) => (finish = r)));
      const { onClose } = await openReview();

      fireEvent.click(screen.getByRole('button', { name: /^Import \d+ selected$/ }));

      expect(await screen.findByRole('button', { name: 'Importing…' })).toBeDisabled();
      expect(screen.getByRole('checkbox', { name: 'Include Go' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(onClose).not.toHaveBeenCalled();

      finish({ importCvProfile: { workExperiences: 1, educations: 1, skills: 2 } });
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('does not import twice on a double click', async () => {
      mockGqlRequest.mockImplementation(() => new Promise(() => {}));
      await openReview();
      const button = screen.getByRole('button', { name: /^Import \d+ selected$/ });

      fireEvent.click(button);
      fireEvent.click(button);

      await screen.findByRole('button', { name: 'Importing…' });
      expect(mockGqlRequest).toHaveBeenCalledTimes(1);
    });
  });
});
