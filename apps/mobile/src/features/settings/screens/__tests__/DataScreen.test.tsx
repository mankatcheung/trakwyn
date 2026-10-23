import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';
import '../../../../i18n';

jest.mock('../../hooks/useAccountData', () => ({
  useExportUserData: jest.fn(),
  useImportUserData: jest.fn(),
}));
jest.mock('../../hooks/useStorageUsage', () => ({ useStorageUsage: jest.fn() }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ text: () => Promise.resolve('{}') })),
}));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import * as DocumentPicker from 'expo-document-picker';
import { useExportUserData, useImportUserData } from '../../hooks/useAccountData';
import { useStorageUsage } from '../../hooks/useStorageUsage';
import { DataScreen } from '../DataScreen';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseExport = jest.mocked(useExportUserData);
const mockedUseImport = jest.mocked(useImportUserData);
const mockedUseTheme = jest.mocked(useTheme);
const mockedUseStorageUsage = jest.mocked(useStorageUsage);

const MB = 1024 * 1024;
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
    mockedUseStorageUsage.mockReturnValue(null);
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
  describe('storage', () => {
    const idle = () => {
      mockedUseExport.mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as never);
      mockedUseImport.mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as never);
    };

    it('shows used of limit with a progress bar', async () => {
      idle();
      mockedUseStorageUsage.mockReturnValue({ usedBytes: 25 * MB, limitBytes: 100 * MB });

      const { getByTestId, queryByTestId } = await render(<DataScreen />);

      expect(getByTestId('storage-usage').props.children).toBe('25 MB of 100 MB used (25%)');
      expect(getByTestId('storage-bar').props.accessibilityValue).toEqual({
        min: 0,
        max: 100 * MB,
        now: 25 * MB,
      });
      expect(queryByTestId('storage-warning')).toBeNull();
      expect(queryByTestId('storage-full')).toBeNull();
    });

    it('warns at 80%', async () => {
      idle();
      mockedUseStorageUsage.mockReturnValue({ usedBytes: 80 * MB, limitBytes: 100 * MB });

      const { getByTestId, queryByTestId } = await render(<DataScreen />);

      expect(getByTestId('storage-warning')).toBeTruthy();
      expect(queryByTestId('storage-full')).toBeNull();
    });

    it('shows the full state at 100%', async () => {
      idle();
      mockedUseStorageUsage.mockReturnValue({ usedBytes: 100 * MB, limitBytes: 100 * MB });

      const { getByTestId, queryByTestId } = await render(<DataScreen />);

      expect(getByTestId('storage-full')).toBeTruthy();
      expect(queryByTestId('storage-warning')).toBeNull();
    });

    it('shows no storage card when the API sends no usage', async () => {
      idle();

      const { queryByTestId } = await render(<DataScreen />);

      expect(queryByTestId('storage-card')).toBeNull();
    });
  });
});
