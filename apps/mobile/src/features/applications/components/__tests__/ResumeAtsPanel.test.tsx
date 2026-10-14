import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../../../../i18n';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

import { gqlRequest } from '../../../../graphql/client';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { ResumeAtsPanel } from '../ResumeAtsPanel';
import type { AtsScore, ResumeRef } from '../../types';

const mockedGqlRequest = jest.mocked(gqlRequest);

const goodScore: AtsScore = {
  id: 'ats-1',
  applicationId: 'app-1',
  documentDraftId: 'draft-1',
  documentId: null,
  score: 81,
  label: 'Good',
  readable: true,
  generatedAt: '2026-10-14T12:00:00.000Z',
  isStale: false,
  checks: [
    {
      id: 'email',
      label: 'Email address',
      passed: true,
      points: 8,
      maxPoints: 8,
      hint: 'Put your email near the top.',
    },
    {
      id: 'skills_heading',
      label: 'Skills heading',
      passed: false,
      points: 0,
      maxPoints: 9,
      hint: 'Add a heading named “Skills”.',
    },
  ],
};

const unreadable: AtsScore = {
  ...goodScore,
  id: 'ats-2',
  score: 0,
  label: 'Not readable by an ATS',
  readable: false,
  checks: [
    {
      id: 'text_extracted',
      label: 'Text can be extracted',
      passed: false,
      points: 0,
      maxPoints: 0,
      hint: 'Export a text-based PDF.',
    },
  ],
};

/** Answers the saved-results list and the check mutation separately. */
function mockApi({
  saved = [],
  computed,
  computeError,
}: {
  saved?: AtsScore[];
  computed?: AtsScore;
  computeError?: Error;
}) {
  mockedGqlRequest.mockImplementation((document: string) => {
    if (document.includes('mutation ComputeResumeAtsScore')) {
      return computeError
        ? Promise.reject(computeError)
        : Promise.resolve({ computeResumeAtsScore: computed });
    }
    return Promise.resolve({ resumeAtsScores: saved });
  });
}

const computeCalls = () =>
  mockedGqlRequest.mock.calls.filter(([doc]) =>
    (doc as string).includes('mutation ComputeResumeAtsScore'),
  );

function renderPanel(resume: ResumeRef = { documentDraftId: 'draft-1' }, resumeId = 'draft-1') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ResumeAtsPanel applicationId="app-1" resume={resume} resumeId={resumeId} />
    </QueryClientProvider>,
  );
}

describe('ResumeAtsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useTheme).mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
  });

  it('offers to check a resume that has no saved result, and runs nothing until asked', async () => {
    mockApi({});
    const { findByText } = await renderPanel();

    expect(await findByText('Check ATS')).toBeTruthy();
    expect(computeCalls()).toHaveLength(0);
  });

  it('shows the saved result as a collapsed bar after a restart, without checking again', async () => {
    mockApi({ saved: [goodScore] });
    const { findByText, queryByText } = await renderPanel();

    expect(await findByText('ATS 81 · Good')).toBeTruthy();
    expect(queryByText('Check ATS')).toBeNull();
    expect(queryByText('Fix these first · 1')).toBeNull();
    expect(computeCalls()).toHaveLength(0);
  });

  it("ignores another resume's saved result", async () => {
    mockApi({ saved: [{ ...goodScore, documentDraftId: 'draft-2' }] });
    const { findByText, queryByText } = await renderPanel();

    expect(await findByText('Check ATS')).toBeTruthy();
    expect(queryByText(/ATS 81/)).toBeNull();
  });

  it('checks a draft by its draft id and opens the checklist', async () => {
    mockApi({ computed: goodScore });
    const { findByText, getByTestId } = await renderPanel();

    await findByText('Check ATS');
    await fireEvent.press(getByTestId('check-resume-ats-draft-1'));

    expect(await findByText('ATS 81 · Good')).toBeTruthy();
    expect(await findByText('Fix these first · 1')).toBeTruthy();
    expect(computeCalls()[0][1]).toEqual({ documentDraftId: 'draft-1', documentId: null });
  });

  it('checks an uploaded file by its document id', async () => {
    mockApi({ computed: { ...goodScore, documentDraftId: null, documentId: 'doc-1' } });
    const { findByText, getByTestId } = await renderPanel({ documentId: 'doc-1' }, 'doc-1');

    await findByText('Check ATS');
    await fireEvent.press(getByTestId('check-resume-ats-doc-1'));

    await findByText('ATS 81 · Good');
    expect(computeCalls()[0][1]).toEqual({ documentDraftId: null, documentId: 'doc-1' });
  });

  it('lists failed checks with their fix, and passing ones without', async () => {
    mockApi({ saved: [goodScore] });
    const { findByTestId, getByText, queryByText } = await renderPanel();

    await fireEvent.press(await findByTestId('resume-ats-toggle-draft-1'));

    expect(getByText('Fix these first · 1')).toBeTruthy();
    expect(getByText('Add a heading named “Skills”.')).toBeTruthy();
    expect(getByText('Passing · 1')).toBeTruthy();
    expect(getByText('0 / 9')).toBeTruthy();
    expect(queryByText('Put your email near the top.')).toBeNull();
  });

  it('collapses and reopens the checklist from the bar', async () => {
    mockApi({ saved: [goodScore] });
    const { findByTestId, getByText, queryByText } = await renderPanel();
    const toggle = await findByTestId('resume-ats-toggle-draft-1');

    await fireEvent.press(toggle);
    expect(getByText('Fix these first · 1')).toBeTruthy();
    await fireEvent.press(toggle);
    expect(queryByText('Fix these first · 1')).toBeNull();
  });

  it('says so when the resume changed after it was checked', async () => {
    mockApi({ saved: [{ ...goodScore, isStale: true }] });
    const { findByText, findByTestId, getByTestId } = await renderPanel();

    expect(await findByText('ATS 81 · Good · Out of date')).toBeTruthy();
    await fireEvent.press(await findByTestId('resume-ats-toggle-draft-1'));
    expect(getByTestId('resume-ats-stale-draft-1')).toBeTruthy();
  });

  it('reports a scan as not readable instead of showing a score', async () => {
    mockApi({ computed: unreadable });
    const { findByText, getByText, getByTestId, queryByText } = await renderPanel();

    await findByText('Check ATS');
    await fireEvent.press(getByTestId('check-resume-ats-draft-1'));

    expect(await findByText('ATS · Not readable')).toBeTruthy();
    expect(getByText(/No text could be extracted/)).toBeTruthy();
    expect(getByText('Export a text-based PDF.')).toBeTruthy();
    expect(queryByText(/ATS 0/)).toBeNull();
  });

  it('checks again from the open checklist, replacing the saved result', async () => {
    mockApi({ saved: [{ ...goodScore, isStale: true }], computed: { ...goodScore, score: 100 } });
    const { findByTestId, findByText, getByTestId, queryByText } = await renderPanel();
    await fireEvent.press(await findByTestId('resume-ats-toggle-draft-1'));

    await fireEvent.press(getByTestId('recheck-resume-ats-draft-1'));

    expect(await findByText('ATS 100 · Good')).toBeTruthy();
    expect(queryByText(/ATS 81/)).toBeNull();
    expect(queryByText(/Out of date/)).toBeNull();
    expect(computeCalls()).toHaveLength(1);
  });

  it('alerts when the check fails and leaves it available', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockApi({ computeError: new Error('Something broke') });
    const { findByText, getByTestId, getByText } = await renderPanel();

    await findByText('Check ATS');
    await fireEvent.press(getByTestId('check-resume-ats-draft-1'));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith('Could not check ATS readiness', expect.any(String)),
    );
    expect(getByText('Check ATS')).toBeTruthy();
  });
});
