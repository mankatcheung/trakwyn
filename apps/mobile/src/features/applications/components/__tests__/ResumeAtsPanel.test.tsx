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
  score: 81,
  label: 'Good',
  readable: true,
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

function renderPanel(resume: ResumeRef = { documentDraftId: 'draft-1' }, resumeId = 'draft-1') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ResumeAtsPanel resume={resume} resumeId={resumeId} />
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

  it('offers to check a resume and runs nothing until asked', async () => {
    const { getByText } = await renderPanel();

    expect(getByText('Check ATS')).toBeTruthy();
    expect(mockedGqlRequest).not.toHaveBeenCalled();
  });

  it('scores a draft by its draft id and opens the checklist', async () => {
    mockedGqlRequest.mockResolvedValue({ computeResumeAtsScore: goodScore });
    const { findByText, getByTestId } = await renderPanel();

    await fireEvent.press(getByTestId('check-resume-ats-draft-1'));

    expect(await findByText('ATS 81 · Good')).toBeTruthy();
    expect(await findByText('Fix these first · 1')).toBeTruthy();
    expect(mockedGqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('mutation ComputeResumeAtsScore'),
      { documentDraftId: 'draft-1', documentId: null },
    );
  });

  it('scores an uploaded file by its document id', async () => {
    mockedGqlRequest.mockResolvedValue({ computeResumeAtsScore: goodScore });
    const { findByText, getByTestId } = await renderPanel({ documentId: 'doc-1' }, 'doc-1');

    await fireEvent.press(getByTestId('check-resume-ats-doc-1'));

    await findByText('ATS 81 · Good');
    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
      documentDraftId: null,
      documentId: 'doc-1',
    });
  });

  it('lists failed checks with their fix, and passing ones without', async () => {
    mockedGqlRequest.mockResolvedValue({ computeResumeAtsScore: goodScore });
    const { findByText, getByText, getByTestId, queryByText } = await renderPanel();

    await fireEvent.press(getByTestId('check-resume-ats-draft-1'));
    await findByText('Fix these first · 1');

    expect(getByText('Add a heading named “Skills”.')).toBeTruthy();
    expect(getByText('Passing · 1')).toBeTruthy();
    expect(getByText('0 / 9')).toBeTruthy();
    expect(queryByText('Put your email near the top.')).toBeNull();
  });

  it('collapses and reopens the checklist from the bar', async () => {
    mockedGqlRequest.mockResolvedValue({ computeResumeAtsScore: goodScore });
    const { findByTestId, getByTestId, queryByText, getByText } = await renderPanel();
    await fireEvent.press(getByTestId('check-resume-ats-draft-1'));
    const toggle = await findByTestId('resume-ats-toggle-draft-1');

    await fireEvent.press(toggle);
    expect(queryByText('Fix these first · 1')).toBeNull();

    await fireEvent.press(toggle);
    expect(getByText('Fix these first · 1')).toBeTruthy();
  });

  it('reports a scan as not readable instead of showing a score', async () => {
    mockedGqlRequest.mockResolvedValue({ computeResumeAtsScore: unreadable });
    const { findByText, getByText, queryByText, getByTestId } = await renderPanel();

    await fireEvent.press(getByTestId('check-resume-ats-draft-1'));

    expect(await findByText('ATS · Not readable')).toBeTruthy();
    expect(getByText(/No text could be extracted/)).toBeTruthy();
    expect(getByText('Export a text-based PDF.')).toBeTruthy();
    expect(queryByText(/ATS 0/)).toBeNull();
  });

  it('runs the check again from the open checklist', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ computeResumeAtsScore: goodScore });
    const { findByText, getByTestId } = await renderPanel();
    await fireEvent.press(getByTestId('check-resume-ats-draft-1'));
    await findByText('Fix these first · 1');

    mockedGqlRequest.mockResolvedValueOnce({
      computeResumeAtsScore: { ...goodScore, score: 100 },
    });
    await fireEvent.press(getByTestId('recheck-resume-ats-draft-1'));

    expect(await findByText('ATS 100 · Good')).toBeTruthy();
    expect(mockedGqlRequest).toHaveBeenCalledTimes(2);
  });

  it('alerts when the check fails and leaves it available', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockedGqlRequest.mockRejectedValue(new Error('Something broke'));
    const { getByTestId, getByText } = await renderPanel();

    await fireEvent.press(getByTestId('check-resume-ats-draft-1'));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith('Could not check ATS readiness', expect.any(String)),
    );
    expect(getByText('Check ATS')).toBeTruthy();
  });
});
