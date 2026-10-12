import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useDocumentQueries', () => ({ useDocuments: jest.fn() }));
jest.mock('../../hooks/useCreateDocumentDraft', () => ({ useCreateDocumentDraft: jest.fn() }));
jest.mock('../../hooks/useExtractDocumentText', () => ({ useExtractDocumentText: jest.fn() }));
jest.mock('../../hooks/useGenerateResume', () => ({ useGenerateResume: jest.fn() }));
jest.mock('../../hooks/useDocumentDraftQueries', () => ({ useDocumentDrafts: jest.fn() }));
jest.mock('../../../applications/hooks/useCoverLetterMutations', () => ({
  useGenerateCoverLetter: jest.fn(),
}));
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
import { useDocumentDrafts } from '../../hooks/useDocumentDraftQueries';
import { useGenerateCoverLetter } from '../../../applications/hooks/useCoverLetterMutations';
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
const mockedUseDocumentDrafts = jest.mocked(useDocumentDrafts);
const mockedUseGenerateCoverLetter = jest.mocked(useGenerateCoverLetter);
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
    mockedUseDocumentDrafts.mockReturnValue({ data: [], isLoading: false } as never);
    mockedUseGenerateCoverLetter.mockReturnValue({
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

describe('NewDraftScreen — generating a cover letter (JEF-396)', () => {
  const replace = jest.fn();
  const file = (id: string, name: string, documentType: string) => ({
    id,
    applicationId: 'app-1',
    name,
    mimeType: 'application/pdf',
    sizeBytes: 10,
    url: `https://example.com/${id}`,
    documentType,
    version: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  const draft = (id: string, title: string, type: string) => ({
    id,
    applicationId: 'app-1',
    type,
    title,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    mockedUseRouter.mockReturnValue({ replace, back: jest.fn() } as never);
    mockedUsePathname.mockReturnValue('/applications/app-1/new-cover-letter');
    mockedUseDocuments.mockReturnValue({
      data: [
        file('f-1', 'resume.pdf', 'resume'),
        file('f-2', 'portfolio.pdf', 'portfolio'),
        file('f-3', 'letter.pdf', 'cover_letter'),
      ],
    } as never);
    mockedUseDocumentDrafts.mockReturnValue({
      data: [
        draft('rd-1', 'My resume draft', 'resume'),
        draft('cd-1', 'An old cover letter', 'cover_letter'),
      ],
      isLoading: false,
    } as never);
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

  const withGenerate = (mutateAsync: jest.Mock) =>
    mockedUseGenerateCoverLetter.mockReturnValue({ mutateAsync, isPending: false } as never);

  it('offers generation here and not on the resume screen', async () => {
    withGenerate(jest.fn());
    const coverLetter = await renderScreen(NewCoverLetterDraftScreen);
    expect(coverLetter.queryByTestId('generate-cover-letter-button')).toBeTruthy();
    await coverLetter.unmount();

    const resume = await renderScreen(NewResumeDraftScreen);
    expect(resume.queryByTestId('generate-cover-letter-button')).toBeNull();
  });

  it("offers only this application's resumes — files and drafts, nothing else", async () => {
    withGenerate(jest.fn());
    const { queryByTestId } = await renderScreen(NewCoverLetterDraftScreen);

    expect(queryByTestId('cover-letter-resume-none')).toBeTruthy();
    expect(queryByTestId('cover-letter-resume-file-f-1')).toBeTruthy();
    expect(queryByTestId('cover-letter-resume-draft-rd-1')).toBeTruthy();
    expect(queryByTestId('cover-letter-resume-file-f-2')).toBeNull();
    expect(queryByTestId('cover-letter-resume-file-f-3')).toBeNull();
    expect(queryByTestId('cover-letter-resume-draft-cd-1')).toBeNull();
  });

  it('generates from the saved profile alone when no resume is chosen, and opens the draft', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ id: 'cl-1' });
    withGenerate(mutateAsync);
    const { getByTestId } = await renderScreen(NewCoverLetterDraftScreen);

    await fireEvent.press(getByTestId('generate-cover-letter-button'));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ resumeDocumentId: null, resumeDraftId: null }),
    );
    expect(replace).toHaveBeenCalledWith('/applications/app-1/documents/cl-1');
  });

  it('sends a chosen uploaded resume as a document id', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ id: 'cl-2' });
    withGenerate(mutateAsync);
    const { getByTestId } = await renderScreen(NewCoverLetterDraftScreen);

    await fireEvent.press(getByTestId('cover-letter-resume-file-f-1'));
    await fireEvent.press(getByTestId('generate-cover-letter-button'));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ resumeDocumentId: 'f-1', resumeDraftId: null }),
    );
  });

  it('sends a chosen resume draft as a draft id, and can go back to none', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ id: 'cl-3' });
    withGenerate(mutateAsync);
    const { getByTestId } = await renderScreen(NewCoverLetterDraftScreen);

    await fireEvent.press(getByTestId('cover-letter-resume-draft-rd-1'));
    await fireEvent.press(getByTestId('generate-cover-letter-button'));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenLastCalledWith({
        resumeDocumentId: null,
        resumeDraftId: 'rd-1',
      }),
    );

    await fireEvent.press(getByTestId('cover-letter-resume-none'));
    await fireEvent.press(getByTestId('generate-cover-letter-button'));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenLastCalledWith({
        resumeDocumentId: null,
        resumeDraftId: null,
      }),
    );
  });

  it('shows why generation failed and stays on the screen', async () => {
    withGenerate(
      jest.fn().mockRejectedValue({
        response: { errors: [{ message: 'Too many requests — slow down' }] },
      }),
    );
    const { getByTestId, findByText } = await renderScreen(NewCoverLetterDraftScreen);

    await fireEvent.press(getByTestId('generate-cover-letter-button'));

    expect(await findByText('Too many requests — slow down')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });
});
