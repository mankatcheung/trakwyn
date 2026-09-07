import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';
import '../../../../i18n';

jest.mock('../../hooks/useAccountData', () => ({
  useExportUserData: jest.fn(),
  useImportUserData: jest.fn(),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ text: () => Promise.resolve('{}') })),
}));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import * as DocumentPicker from 'expo-document-picker';
import { useExportUserData, useImportUserData } from '../../hooks/useAccountData';
import { DataScreen } from '../DataScreen';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseExport = jest.mocked(useExportUserData);
const mockedUseImport = jest.mocked(useImportUserData);
const mockedUseTheme = jest.mocked(useTheme);
const mockedGetDocumentAsync = jest.mocked(DocumentPicker.getDocumentAsync);

describe('DataScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
    jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
  });

  it('exports data and opens the share sheet', async () => {
    const mutateAsync = jest.fn().mockResolvedValue('{"applications":[]}');
    mockedUseExport.mockReturnValue({ mutateAsync, isPending: false } as never);
    mockedUseImport.mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as never);

    const { getByTestId } = await render(<DataScreen />);

    await fireEvent.press(getByTestId('export-data-button'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(Share.share).toHaveBeenCalledWith(
      expect.objectContaining({ message: '{"applications":[]}' }),
    );
  });

  it('imports a chosen file and shows the result summary', async () => {
    mockedUseExport.mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as never);
    const importMutateAsync = jest.fn().mockResolvedValue({
      applicationsImported: 2,
      applicationsSkipped: 1,
      notesImported: 3,
      documentsSkipped: 0,
    });
    mockedUseImport.mockReturnValue({ mutateAsync: importMutateAsync, isPending: false } as never);
    mockedGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///export.json' }],
    } as never);

    const { getByTestId, findByTestId } = await render(<DataScreen />);

    await fireEvent.press(getByTestId('import-data-button'));

    const summary = await findByTestId('import-result');
    expect(summary.props.children).toContain('2 applications imported');
    expect(importMutateAsync).toHaveBeenCalledWith('{}');
  });

  it('does nothing when the file picker is cancelled', async () => {
    mockedUseExport.mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as never);
    const importMutateAsync = jest.fn();
    mockedUseImport.mockReturnValue({ mutateAsync: importMutateAsync, isPending: false } as never);
    mockedGetDocumentAsync.mockResolvedValue({ canceled: true, assets: null } as never);

    const { getByTestId } = await render(<DataScreen />);

    await fireEvent.press(getByTestId('import-data-button'));

    expect(importMutateAsync).not.toHaveBeenCalled();
  });
});
