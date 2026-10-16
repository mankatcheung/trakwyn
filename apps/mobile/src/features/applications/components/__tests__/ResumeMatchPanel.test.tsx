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
import { ResumeMatchPanel } from '../ResumeMatchPanel';
import type { ResumeMatch, ResumeRef } from '../../types';

const mockedGqlRequest = jest.mocked(gqlRequest);

const draftMatch: ResumeMatch = {
  id: 'match-1',
  applicationId: 'app-1',
  documentDraftId: 'draft-1',
  documentId: null,
  score: 82,
  label: 'Good match',
  matchedKeywords: ['TypeScript', 'GraphQL'],
  missingKeywords: ['Kubernetes'],
  summary: 'Strong overlap on core skills.',
  generatedAt: '2026-10-12T12:00:00.000Z',
  isStale: false,
};

/** Answers the list query and the compute mutation separately. */
function mockApi({
  matches = [],
  computed,
  computeError,
}: {
  matches?: ResumeMatch[];
  computed?: ResumeMatch;
  computeError?: Error;
}) {
  mockedGqlRequest.mockImplementation((document: string) => {
    if (document.includes('mutation ComputeResumeMatchScore')) {
      return computeError
        ? Promise.reject(computeError)
        : Promise.resolve({ computeResumeMatchScore: computed });
    }
    return Promise.resolve({ resumeMatches: matches });
  });
}

function renderPanel(resume: ResumeRef = { documentDraftId: 'draft-1' }, resumeId = 'draft-1') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ResumeMatchPanel applicationId="app-1" resume={resume} resumeId={resumeId} />
    </QueryClientProvider>,
  );
}

describe('ResumeMatchPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useTheme).mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
  });

  it('offers to generate a match when there is none yet', async () => {
    mockApi({});
    const { findByText, queryByText } = await renderPanel();

    expect(await findByText('Generate match')).toBeTruthy();
    expect(queryByText(/Good match/)).toBeNull();
  });

  it('shows the saved score as a collapsed bar without running the mutation', async () => {
    mockApi({ matches: [draftMatch] });
    const { findByText, queryByText } = await renderPanel();

    expect(await findByText('82 · Good match')).toBeTruthy();
    expect(queryByText('Strong overlap on core skills.')).toBeNull();
    expect(mockedGqlRequest).not.toHaveBeenCalledWith(
      expect.stringContaining('mutation ComputeResumeMatchScore'),
      expect.anything(),
    );
  });

  it('expands in place to the summary and keywords, and collapses again', async () => {
    mockApi({ matches: [draftMatch] });
    const { findByTestId, getByText, queryByText } = await renderPanel();

    const toggle = await findByTestId('resume-match-toggle-draft-1');
    expect(toggle.props.accessibilityState).toEqual(expect.objectContaining({ expanded: false }));
    await fireEvent.press(toggle);

    expect(getByText('Strong overlap on core skills.')).toBeTruthy();
    expect(getByText('TypeScript')).toBeTruthy();
    expect(getByText('Kubernetes')).toBeTruthy();
    expect(getByText('Regenerate')).toBeTruthy();

    await fireEvent.press(toggle);
    expect(queryByText('Strong overlap on core skills.')).toBeNull();
  });

  it("ignores another resume's match", async () => {
    mockApi({ matches: [{ ...draftMatch, documentDraftId: 'draft-2' }] });
    const { findByText, queryByText } = await renderPanel();

    expect(await findByText('Generate match')).toBeTruthy();
    expect(queryByText(/Good match/)).toBeNull();
  });

  it('generates a match for a draft and opens the result', async () => {
    mockApi({ computed: draftMatch });
    const { findByText, getByTestId } = await renderPanel();

    await findByText('Generate match');
    await fireEvent.press(getByTestId('generate-resume-match-draft-1'));

    expect(await findByText('82 · Good match')).toBeTruthy();
    expect(await findByText('Strong overlap on core skills.')).toBeTruthy();
    expect(mockedGqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('mutation ComputeResumeMatchScore'),
      { applicationId: 'app-1', documentDraftId: 'draft-1', documentId: null },
    );
  });

  it('generates a match for an uploaded document by its document id', async () => {
    mockApi({ computed: { ...draftMatch, documentDraftId: null, documentId: 'doc-1' } });
    const { findByText, getByTestId } = await renderPanel({ documentId: 'doc-1' }, 'doc-1');

    await findByText('Generate match');
    await fireEvent.press(getByTestId('generate-resume-match-doc-1'));

    await waitFor(() =>
      expect(mockedGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('mutation ComputeResumeMatchScore'),
        { applicationId: 'app-1', documentDraftId: null, documentId: 'doc-1' },
      ),
    );
    expect(await findByText('82 · Good match')).toBeTruthy();
  });

  describe('when the resume changed since the match', () => {
    it('marks the bar and shows the reminder to regenerate once expanded', async () => {
      mockApi({ matches: [{ ...draftMatch, isStale: true }] });
      const { findByTestId, findByText, queryByTestId } = await renderPanel();

      expect(await findByText(/Out of date/)).toBeTruthy();
      expect(queryByTestId('resume-match-stale-draft-1')).toBeNull();

      await fireEvent.press(await findByTestId('resume-match-toggle-draft-1'));
      expect(await findByTestId('resume-match-stale-draft-1')).toBeTruthy();
      expect(await findByText(/This resume has changed/)).toBeTruthy();
    });

    it('does not mark an up-to-date match', async () => {
      mockApi({ matches: [draftMatch] });
      const { findByTestId, queryByText, queryByTestId } = await renderPanel();

      await fireEvent.press(await findByTestId('resume-match-toggle-draft-1'));
      expect(queryByText(/Out of date/)).toBeNull();
      expect(queryByTestId('resume-match-stale-draft-1')).toBeNull();
    });

    it('clears the reminder after regenerating', async () => {
      mockApi({
        matches: [{ ...draftMatch, isStale: true, score: 40, label: 'Some overlap' }],
        computed: { ...draftMatch, id: 'match-2', score: 90, label: 'Excellent match' },
      });
      const { findByTestId, findByText, queryByText, queryByTestId } = await renderPanel();

      await fireEvent.press(await findByTestId('resume-match-toggle-draft-1'));
      await fireEvent.press(await findByTestId('generate-resume-match-draft-1'));

      expect(await findByText('90 · Excellent match')).toBeTruthy();
      expect(queryByText(/Some overlap/)).toBeNull();
      expect(queryByTestId('resume-match-stale-draft-1')).toBeNull();
    });
  });

  it('alerts when generating fails and keeps the button available', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockApi({ computeError: new Error('Something broke') });
    const { findByTestId } = await renderPanel();

    await fireEvent.press(await findByTestId('generate-resume-match-draft-1'));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith('Could not check match', expect.any(String)),
    );
    expect(await findByTestId('generate-resume-match-draft-1')).toBeTruthy();
  });
});
