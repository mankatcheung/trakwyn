import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../hooks/useDraftHistory', () => ({
  useDraftVersions: jest.fn(),
  useDraftVersion: jest.fn(),
  useCreateDraftVersion: jest.fn(),
  useRestoreDraftVersion: jest.fn(),
}));

import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import {
  useCreateDraftVersion,
  useDraftVersion,
  useDraftVersions,
  useRestoreDraftVersion,
} from '../../hooks/useDraftHistory';
import { DraftHistorySheet } from '../DraftHistorySheet';

const versions = [
  { id: 'v2', source: 'ai', characterCount: 1200, createdAt: '2026-01-02T10:00:00.000Z' },
  { id: 'v1', source: 'autosave', characterCount: 1, createdAt: '2026-01-01T10:00:00.000Z' },
];
const formatted = JSON.stringify({
  type: 'doc',
  content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Jane' }] }],
});

const createAsync = jest.fn();
const restoreAsync = jest.fn();

function mocks(over: { versions?: unknown; preview?: unknown } = {}) {
  jest.mocked(useDraftVersions).mockReturnValue({
    data: versions,
    isLoading: false,
    isError: false,
    ...(over.versions as object),
  } as never);
  jest.mocked(useDraftVersion).mockImplementation(
    (id: string | null) =>
      ({
        data: id ? { id, source: 'ai', contentJson: formatted, plainText: 'Jane' } : undefined,
        isLoading: false,
        isError: false,
        ...(over.preview as object),
      }) as never,
  );
  jest.mocked(useCreateDraftVersion).mockReturnValue({
    mutateAsync: createAsync,
    isPending: false,
  } as never);
  jest.mocked(useRestoreDraftVersion).mockReturnValue({
    mutateAsync: restoreAsync,
    isPending: false,
  } as never);
}

async function renderSheet(prepare = jest.fn().mockResolvedValue(true)) {
  const onClose = jest.fn();
  const onRestored = jest.fn();
  const utils = await render(
    <DraftHistorySheet
      visible
      onClose={onClose}
      draftId="d1"
      prepare={prepare}
      onRestored={onRestored}
    />,
  );
  return { ...utils, prepare, onClose, onRestored };
}

describe('DraftHistorySheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useTheme).mockReturnValue({ colors: lightColors } as never);
    mocks();
  });

  it('lists the versions with their source', async () => {
    const { getByText, getByTestId } = await renderSheet();
    getByText('Before AI change');
    getByText('Edited');
    expect(getByTestId('draft-history-version-v2')).toBeTruthy();
    expect(getByText(/1,200 characters/)).toBeTruthy();
    expect(getByText(/· 1 character$/)).toBeTruthy();
  });

  it('shows an empty state', async () => {
    mocks({ versions: { data: [] } });
    const { getByTestId } = await renderSheet();
    expect(getByTestId('draft-history-empty')).toBeTruthy();
  });

  it('shows a loading state', async () => {
    mocks({ versions: { data: undefined, isLoading: true } });
    const { getByTestId } = await renderSheet();
    expect(getByTestId('draft-history-loading')).toBeTruthy();
  });

  it('shows a load error', async () => {
    mocks({ versions: { data: undefined, isError: true, error: new Error('x') } });
    const { getByTestId } = await renderSheet();
    expect(getByTestId('draft-history-load-error')).toBeTruthy();
  });

  it('previews a version with its formatting', async () => {
    const { getByTestId, queryByTestId, getByText } = await renderSheet();
    expect(queryByTestId('draft-history-preview')).toBeNull();
    await fireEvent.press(getByTestId('draft-history-version-v2'));
    expect(getByTestId('draft-history-preview')).toBeTruthy();
    // Rendered by the Markdown view from `# Jane`, not shown as literal text.
    getByText('Jane');
  });

  it('restores only after a confirmation, then hands the draft to the editor', async () => {
    const restored = { id: 'd1', contentJson: formatted, plainText: 'Jane', updatedAt: 'now' };
    restoreAsync.mockResolvedValueOnce(restored);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByTestId, prepare, onRestored, onClose } = await renderSheet();
    await fireEvent.press(getByTestId('draft-history-version-v2'));
    await fireEvent.press(getByTestId('draft-history-restore'));

    expect(restoreAsync).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0]![2]!;
    await buttons.find((b) => b.style !== 'cancel')!.onPress!();

    await waitFor(() => expect(onRestored).toHaveBeenCalledWith(restored));
    expect(prepare).toHaveBeenCalled();
    expect(restoreAsync).toHaveBeenCalledWith('v2');
    expect(onClose).toHaveBeenCalled();
  });

  it('does not restore when the pending edit could not be saved', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByTestId, onRestored } = await renderSheet(jest.fn().mockResolvedValue(false));
    await fireEvent.press(getByTestId('draft-history-version-v2'));
    await fireEvent.press(getByTestId('draft-history-restore'));
    await alert.mock.calls[0]![2]!.find((b) => b.style !== 'cancel')!.onPress!();

    await waitFor(() => expect(getByTestId('draft-history-error')).toBeTruthy());
    expect(restoreAsync).not.toHaveBeenCalled();
    expect(onRestored).not.toHaveBeenCalled();
  });

  it('saves a version after settling the editor, and shows the error from getErrorMessage', async () => {
    createAsync.mockResolvedValueOnce({ id: 'v3' });
    const { getByTestId, prepare } = await renderSheet();
    await fireEvent.press(getByTestId('draft-history-save'));
    await waitFor(() => expect(getByTestId('draft-history-notice')).toBeTruthy());
    expect(prepare).toHaveBeenCalled();

    createAsync.mockRejectedValueOnce(new Error('boom'));
    await fireEvent.press(getByTestId('draft-history-save'));
    await waitFor(() => expect(getByTestId('draft-history-error')).toBeTruthy());
  });
});
