import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useDocumentQueries', () => ({ useDocuments: jest.fn() }));
jest.mock('../../hooks/useDocumentDraftQueries', () => ({ useDocumentDrafts: jest.fn() }));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { useDocuments } from '../../hooks/useDocumentQueries';
import { useDocumentDrafts } from '../../hooks/useDocumentDraftQueries';
import { ResumeSourcePicker } from '../ResumeSourcePicker';

describe('ResumeSourcePicker', () => {
  beforeEach(() => {
    jest.mocked(useTheme).mockReturnValue({ colors: lightColors } as never);
    jest.mocked(useDocuments).mockReturnValue({
      data: [
        { id: 'f1', name: 'cv.pdf', documentType: 'resume' },
        { id: 'f2', name: 'offer.pdf', documentType: 'offer_letter' },
      ],
    } as never);
    jest.mocked(useDocumentDrafts).mockReturnValue({
      data: [
        { id: 'd1', title: 'My Resume', type: 'resume' },
        { id: 'd2', title: 'A Letter', type: 'cover_letter' },
      ],
    } as never);
  });

  it('lists only this application’s resumes, files and drafts', async () => {
    const { getByTestId, queryByTestId } = await render(
      <ResumeSourcePicker applicationId="a" value={null} onChange={jest.fn()} />,
    );
    expect(getByTestId('cover-letter-resume-none')).toBeTruthy();
    expect(getByTestId('cover-letter-resume-file-f1')).toBeTruthy();
    expect(getByTestId('cover-letter-resume-draft-d1')).toBeTruthy();
    expect(queryByTestId('cover-letter-resume-file-f2')).toBeNull();
    expect(queryByTestId('cover-letter-resume-draft-d2')).toBeNull();
  });

  it('reports the choice, and None clears it', async () => {
    const onChange = jest.fn();
    const { getByTestId } = await render(
      <ResumeSourcePicker
        applicationId="a"
        value={{ kind: 'draft', id: 'd1' }}
        onChange={onChange}
      />,
    );
    await fireEvent.press(getByTestId('cover-letter-resume-file-f1'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'file', id: 'f1' });
    await fireEvent.press(getByTestId('cover-letter-resume-none'));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
