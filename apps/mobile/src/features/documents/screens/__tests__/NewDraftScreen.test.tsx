import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useDocumentQueries', () => ({ useDocuments: jest.fn() }));
jest.mock('../../hooks/useCreateDocumentDraft', () => ({ useCreateDocumentDraft: jest.fn() }));
jest.mock('../../hooks/useExtractDocumentText', () => ({ useExtractDocumentText: jest.fn() }));
jest.mock('../../hooks/useGenerateResume', () => ({ useGenerateResume: jest.fn() }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useRouter: jest.fn(),
  usePathname: jest.fn(),
}));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useDocuments } from '../../hooks/useDocumentQueries';
import { useCreateDocumentDraft } from '../../hooks/useCreateDocumentDraft';
import { useExtractDocumentText } from '../../hooks/useExtractDocumentText';
import { useGenerateResume } from '../../hooks/useGenerateResume';
import { NewCoverLetterDraftScreen, NewResumeDraftScreen } from '../NewDraftScreen';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseLocalSearchParams = jest.mocked(useLocalSearchParams);
const mockedUsePathname = jest.mocked(usePathname);
const mockedUseRouter = jest.mocked(useRouter);
const mockedUseDocuments = jest.mocked(useDocuments);
const mockedUseCreateDocumentDraft = jest.mocked(useCreateDocumentDraft);
const mockedUseExtractDocumentText = jest.mocked(useExtractDocumentText);
const mockedUseGenerateResume = jest.mocked(useGenerateResume);
const mockedUseTheme = jest.mocked(useTheme);

function renderScreen(Screen: () => React.JSX.Element) {
  mockedUseLocalSearchParams.mockReturnValue({ id: 'app-1' } as never);
  return render(<Screen />);
}

describe('NewDraftScreen — no type to choose (JEF-396)', () => {
  const replace = jest.fn();
  const back = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    mockedUseRouter.mockReturnValue({ replace, back } as never);
    mockedUseDocuments.mockReturnValue({ data: [] } as never);
    mockedUseExtractDocumentText.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    } as never);
    mockedUseGenerateResume.mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as never);
    mockedUseCreateDocumentDraft.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    } as never);
  });

  it.each([
    ['cover letter', NewCoverLetterDraftScreen],
    ['resume', NewResumeDraftScreen],
  ] as const)('has no type toggle on the %s screen', async (_name, Screen) => {
    mockedUsePathname.mockReturnValue('/applications/app-1/new-resume');
    const { queryByTestId, queryByText } = await renderScreen(Screen);

    expect(queryByTestId('draft-type-cover_letter')).toBeNull();
    expect(queryByTestId('draft-type-resume')).toBeNull();
    expect(queryByText('Type')).toBeNull();
  });

  it('creates a cover letter draft with the type the route implies, and opens it', async () => {
    mockedUsePathname.mockReturnValue('/applications/app-1/new-cover-letter');
    const mutateAsync = jest.fn().mockResolvedValue({ id: 'draft-1' });
    mockedUseCreateDocumentDraft.mockReturnValue({ mutateAsync, isPending: false } as never);

    const { getByTestId } = await renderScreen(NewCoverLetterDraftScreen);

    await fireEvent.changeText(getByTestId('draft-title-input'), 'My cover letter');
    await fireEvent.press(getByTestId('create-draft-button'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: 'app-1',
        type: 'cover_letter',
        title: 'My cover letter',
      }),
    );
    // The editor is documents/<id>, a sibling of the new-* route.
    expect(replace).toHaveBeenCalledWith('/applications/app-1/documents/draft-1');
  });

  it('creates a resume draft with the resume type', async () => {
    mockedUsePathname.mockReturnValue('/applications/app-1/new-resume');
    const mutateAsync = jest.fn().mockResolvedValue({ id: 'draft-3' });
    mockedUseCreateDocumentDraft.mockReturnValue({ mutateAsync, isPending: false } as never);

    const { getByTestId } = await renderScreen(NewResumeDraftScreen);

    await fireEvent.changeText(getByTestId('draft-title-input'), 'My resume');
    await fireEvent.press(getByTestId('create-draft-button'));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'resume', title: 'My resume' }),
      ),
    );
    expect(replace).toHaveBeenCalledWith('/applications/app-1/documents/draft-3');
  });

  it('offers AI generation on the resume screen only', async () => {
    mockedUsePathname.mockReturnValue('/applications/app-1/new-resume');
    mockedUseCreateDocumentDraft.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    } as never);

    const resume = await renderScreen(NewResumeDraftScreen);
    expect(resume.queryByTestId('generate-resume-button')).toBeTruthy();
    await resume.unmount();

    const coverLetter = await renderScreen(NewCoverLetterDraftScreen);
    expect(coverLetter.queryByTestId('generate-resume-button')).toBeNull();
  });

  it('generates a resume draft and opens it', async () => {
    mockedUsePathname.mockReturnValue('/applications/app-1/new-resume');
    const generateMutateAsync = jest.fn().mockResolvedValue({ id: 'draft-2' });
    mockedUseCreateDocumentDraft.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    } as never);
    mockedUseGenerateResume.mockReturnValue({
      mutateAsync: generateMutateAsync,
      isPending: false,
    } as never);

    const { getByTestId } = await renderScreen(NewResumeDraftScreen);

    await fireEvent.press(getByTestId('generate-resume-button'));

    await waitFor(() => expect(generateMutateAsync).toHaveBeenCalled());
    expect(replace).toHaveBeenCalledWith('/applications/app-1/documents/draft-2');
  });
});
