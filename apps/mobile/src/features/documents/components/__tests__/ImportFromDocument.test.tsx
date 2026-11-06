import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useDocumentQueries', () => ({ useDocuments: jest.fn() }));
jest.mock('../../hooks/useExtractDocumentText', () => ({ useExtractDocumentText: jest.fn() }));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { useDocuments } from '../../hooks/useDocumentQueries';
import { useExtractDocumentText } from '../../hooks/useExtractDocumentText';
import { ImportFromDocument } from '../ImportFromDocument';

const extract = jest.fn();

describe('ImportFromDocument', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useTheme).mockReturnValue({ colors: lightColors } as never);
    jest.mocked(useExtractDocumentText).mockReturnValue({
      mutateAsync: extract,
      isPending: false,
    } as never);
    jest.mocked(useDocuments).mockReturnValue({
      data: [{ id: 'doc-1', name: 'old-resume.pdf' }],
    } as never);
  });

  it('renders nothing when the application has no documents', async () => {
    jest.mocked(useDocuments).mockReturnValue({ data: [] } as never);
    const { queryByTestId } = await render(
      <ImportFromDocument applicationId="a" onImport={jest.fn()} />,
    );
    expect(queryByTestId('draft-import')).toBeNull();
  });

  it('imports the text of the chosen document', async () => {
    extract.mockResolvedValueOnce('Extracted body');
    const onImport = jest.fn();
    const { getByTestId } = await render(
      <ImportFromDocument applicationId="a" onImport={onImport} />,
    );

    await fireEvent.press(getByTestId('draft-import-toggle'));
    await fireEvent.press(getByTestId('draft-import-doc-1'));

    await waitFor(() => expect(onImport).toHaveBeenCalledWith('Extracted body'));
    expect(extract).toHaveBeenCalledWith('doc-1');
  });

  it('says so when the document has no readable text', async () => {
    extract.mockResolvedValueOnce('   ');
    const onImport = jest.fn();
    const { getByTestId } = await render(
      <ImportFromDocument applicationId="a" onImport={onImport} />,
    );

    await fireEvent.press(getByTestId('draft-import-toggle'));
    await fireEvent.press(getByTestId('draft-import-doc-1'));

    await waitFor(() => expect(getByTestId('draft-import-error')).toBeTruthy());
    expect(onImport).not.toHaveBeenCalled();
  });

  it('shows the API message when extraction fails', async () => {
    extract.mockRejectedValueOnce({ response: { errors: [{ message: 'Unsupported file' }] } });
    const { getByTestId } = await render(
      <ImportFromDocument applicationId="a" onImport={jest.fn()} />,
    );

    await fireEvent.press(getByTestId('draft-import-toggle'));
    await fireEvent.press(getByTestId('draft-import-doc-1'));

    await waitFor(() =>
      expect(getByTestId('draft-import-error').props.children).toBe('Unsupported file'),
    );
  });
});
