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
import { NewDocumentDraftScreen } from '../NewDocumentDraftScreen';
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

function renderScreen() {
  mockedUseLocalSearchParams.mockReturnValue({ id: 'app-1' } as never);
  return render(<NewDocumentDraftScreen />);
}

describe('NewDocumentDraftScreen', () => {
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
    mockedUsePathname.mockReturnValue('/applications/app-1/documents/new');
    mockedUseDocuments.mockReturnValue({ data: [] } as never);
    mockedUseExtractDocumentText.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    } as never);
  });

  it('creates a blank cover letter draft and opens it', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ id: 'draft-1' });
    mockedUseCreateDocumentDraft.mockReturnValue({ mutateAsync, isPending: false } as never);
    mockedUseGenerateResume.mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as never);

    const { getByTestId } = await renderScreen();

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
    expect(replace).toHaveBeenCalledWith('/applications/app-1/documents/draft-1');
  });

  it('generates a resume draft from the resume type and opens it', async () => {
    const generateMutateAsync = jest.fn().mockResolvedValue({ id: 'draft-2' });
    mockedUseCreateDocumentDraft.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    } as never);
    mockedUseGenerateResume.mockReturnValue({
      mutateAsync: generateMutateAsync,
      isPending: false,
    } as never);

    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('draft-type-resume'));
    await fireEvent.press(getByTestId('generate-resume-button'));

    await waitFor(() => expect(generateMutateAsync).toHaveBeenCalled());
    expect(replace).toHaveBeenCalledWith('/applications/app-1/documents/draft-2');
  });
});
