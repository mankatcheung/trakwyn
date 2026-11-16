import React from 'react';
import { render } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useAnalyticsQueries', () => ({
  useDocumentVersionOutcomes: jest.fn(),
}));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../../../i18n/LanguageContext', () => ({
  useLanguage: jest.fn(() => ({ mode: 'system', resolvedLanguage: 'en', setMode: jest.fn() })),
}));

import { useDocumentVersionOutcomes } from '../../hooks/useAnalyticsQueries';
import { DocumentVersionOutcomesSection } from '../DocumentVersionOutcomesSection';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseOutcomes = jest.mocked(useDocumentVersionOutcomes);

function outcome(documentType: string, version: string | null) {
  return { documentType, version, applicationCount: 4, interviewCount: 1, interviewRate: 25 };
}

describe('DocumentVersionOutcomesSection', () => {
  beforeEach(() => {
    jest.mocked(useTheme).mockReturnValue({ colors: lightColors } as never);
  });

  it('labels the Generated version "Generated in Trakwyn"', async () => {
    mockedUseOutcomes.mockReturnValue({
      data: [outcome('resume', 'Generated')],
      isLoading: false,
    } as never);
    const { getByText, queryByText } = await render(<DocumentVersionOutcomesSection />);
    expect(getByText('Resume: Generated in Trakwyn')).toBeTruthy();
    expect(queryByText('Resume: Generated')).toBeNull();
  });

  it('shows a version the user named as it is, and a missing one as a dash', async () => {
    mockedUseOutcomes.mockReturnValue({
      data: [outcome('cover_letter', 'v2'), outcome('resume', null)],
      isLoading: false,
    } as never);
    const { getByText } = await render(<DocumentVersionOutcomesSection />);
    expect(getByText('Cover letter: v2')).toBeTruthy();
    expect(getByText('Resume: —')).toBeTruthy();
  });
});
