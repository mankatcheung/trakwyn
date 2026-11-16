import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useProfileSections', () => ({
  useCertifications: jest.fn(),
  useCreateCertification: jest.fn(),
  useUpdateCertification: jest.fn(),
  useDeleteCertification: jest.fn(),
  useLanguages: jest.fn(),
  useCreateLanguage: jest.fn(),
  useUpdateLanguage: jest.fn(),
  useDeleteLanguage: jest.fn(),
  useProjects: jest.fn(),
  useCreateProject: jest.fn(),
  useUpdateProject: jest.fn(),
  useDeleteProject: jest.fn(),
  useAwards: jest.fn(),
  useCreateAward: jest.fn(),
  useUpdateAward: jest.fn(),
  useDeleteAward: jest.fn(),
}));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

import * as hooks from '../../hooks/useProfileSections';
import { AwardsSection } from '../experience/AwardsSection';
import { CertificationsSection } from '../experience/CertificationsSection';
import { LanguagesSection } from '../experience/LanguagesSection';
import { ProjectsSection } from '../experience/ProjectsSection';
import { entryInput, initialValues } from '../experience/ProfileEntrySection';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const h = jest.mocked(hooks);

interface Handles {
  create: jest.Mock;
  update: jest.Mock;
  remove: jest.Mock;
}

function arrange(
  list: jest.MockedFunction<never>,
  create: jest.MockedFunction<never>,
  update: jest.MockedFunction<never>,
  remove: jest.MockedFunction<never>,
  data: unknown[],
): Handles {
  const handles = {
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    remove: jest.fn(),
  };
  (list as jest.Mock).mockReturnValue({ data, isLoading: false });
  (create as jest.Mock).mockReturnValue({ mutateAsync: handles.create, isPending: false });
  (update as jest.Mock).mockReturnValue({ mutateAsync: handles.update, isPending: false });
  (remove as jest.Mock).mockReturnValue({ mutate: handles.remove });
  return handles;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useTheme).mockReturnValue({
    mode: 'light',
    resolvedScheme: 'light',
    colors: lightColors,
    setMode: jest.fn(),
  } as never);
});

describe('entry helpers', () => {
  const fields = [
    { key: 'name', placeholder: 'n', required: true },
    { key: 'issuer', placeholder: 'i' },
    { key: 'issuedAt', placeholder: 'd', date: true },
  ];

  it('opens a stored entry as text, with a date cut to the day', () => {
    expect(
      initialValues(fields, { name: 'AWS', issuer: null, issuedAt: '2024-05-01T00:00:00.000Z' }),
    ).toEqual({ name: 'AWS', issuer: '', issuedAt: '2024-05-01' });
  });

  it('leaves a blank optional field out on create', () => {
    expect(entryInput(fields, { name: ' AWS ', issuer: '', issuedAt: '' }, false)).toEqual({
      name: 'AWS',
    });
  });

  it('sends null for a blank optional field on update, so it is cleared', () => {
    expect(entryInput(fields, { name: 'AWS', issuer: '', issuedAt: '' }, true)).toEqual({
      name: 'AWS',
      issuer: null,
      issuedAt: null,
    });
  });
});

describe('CertificationsSection', () => {
  const cert = {
    id: 'c1',
    name: 'AWS SAA',
    issuer: 'Amazon',
    issuedAt: '2024-05-01T00:00:00.000Z',
    expiresAt: null,
    credentialUrl: null,
  };

  it('shows the empty state', async () => {
    arrange(
      h.useCertifications as never,
      h.useCreateCertification as never,
      h.useUpdateCertification as never,
      h.useDeleteCertification as never,
      [],
    );
    const { getByText } = await render(<CertificationsSection />);
    expect(getByText('No certifications yet.')).toBeTruthy();
  });

  it('lists an entry with its issuer and date', async () => {
    arrange(
      h.useCertifications as never,
      h.useCreateCertification as never,
      h.useUpdateCertification as never,
      h.useDeleteCertification as never,
      [cert],
    );
    const { getByText } = await render(<CertificationsSection />);
    expect(getByText('AWS SAA')).toBeTruthy();
    expect(getByText('Amazon · 2024-05-01')).toBeTruthy();
  });

  it('adds a certification and sends only the filled fields', async () => {
    const { create } = arrange(
      h.useCertifications as never,
      h.useCreateCertification as never,
      h.useUpdateCertification as never,
      h.useDeleteCertification as never,
      [],
    );
    const { getByTestId } = await render(<CertificationsSection />);

    await fireEvent.press(getByTestId('add-certification-button'));
    await fireEvent.changeText(getByTestId('certification-name-input'), 'CKA');
    await fireEvent.changeText(getByTestId('certification-issuedAt-input'), '2025-01-15');
    await fireEvent.press(getByTestId('save-certification-button'));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({ name: 'CKA', issuedAt: '2025-01-15' }),
    );
  });

  it('cannot save without a name', async () => {
    const { create } = arrange(
      h.useCertifications as never,
      h.useCreateCertification as never,
      h.useUpdateCertification as never,
      h.useDeleteCertification as never,
      [],
    );
    const { getByTestId } = await render(<CertificationsSection />);

    await fireEvent.press(getByTestId('add-certification-button'));
    await fireEvent.press(getByTestId('save-certification-button'));

    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a date that is not YYYY-MM-DD', async () => {
    const { create } = arrange(
      h.useCertifications as never,
      h.useCreateCertification as never,
      h.useUpdateCertification as never,
      h.useDeleteCertification as never,
      [],
    );
    const { getByTestId, findByTestId } = await render(<CertificationsSection />);

    await fireEvent.press(getByTestId('add-certification-button'));
    await fireEvent.changeText(getByTestId('certification-name-input'), 'CKA');
    await fireEvent.changeText(getByTestId('certification-issuedAt-input'), 'May 2025');

    await findByTestId('certification-date-error');
    await fireEvent.press(getByTestId('save-certification-button'));
    expect(create).not.toHaveBeenCalled();
  });

  it('edits an entry, clearing a blanked field with null', async () => {
    const { update } = arrange(
      h.useCertifications as never,
      h.useCreateCertification as never,
      h.useUpdateCertification as never,
      h.useDeleteCertification as never,
      [cert],
    );
    const { getByTestId } = await render(<CertificationsSection />);

    await fireEvent.press(getByTestId('edit-certification-c1'));
    expect(getByTestId('certification-name-input').props.value).toBe('AWS SAA');
    expect(getByTestId('certification-issuedAt-input').props.value).toBe('2024-05-01');
    await fireEvent.changeText(getByTestId('certification-issuer-input'), '');
    await fireEvent.press(getByTestId('save-certification-button'));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        id: 'c1',
        input: {
          name: 'AWS SAA',
          issuer: null,
          issuedAt: '2024-05-01',
          expiresAt: null,
          credentialUrl: null,
        },
      }),
    );
  });

  it('shows the API error and keeps the form open when a save fails', async () => {
    const { create } = arrange(
      h.useCertifications as never,
      h.useCreateCertification as never,
      h.useUpdateCertification as never,
      h.useDeleteCertification as never,
      [],
    );
    create.mockRejectedValueOnce({
      response: { errors: [{ message: 'Certification limit reached' }] },
    });
    const { getByTestId, findByText } = await render(<CertificationsSection />);

    await fireEvent.press(getByTestId('add-certification-button'));
    await fireEvent.changeText(getByTestId('certification-name-input'), 'CKA');
    await fireEvent.press(getByTestId('save-certification-button'));

    expect(await findByText('Certification limit reached')).toBeTruthy();
    expect(getByTestId('certification-form-modal')).toBeTruthy();
  });

  it('deletes an entry', async () => {
    const { remove } = arrange(
      h.useCertifications as never,
      h.useCreateCertification as never,
      h.useUpdateCertification as never,
      h.useDeleteCertification as never,
      [cert],
    );
    const { getByTestId } = await render(<CertificationsSection />);

    await fireEvent.press(getByTestId('delete-certification-c1'));

    expect(remove).toHaveBeenCalledWith('c1');
  });
});

describe('LanguagesSection', () => {
  it('lists a language with its proficiency and adds one', async () => {
    const { create } = arrange(
      h.useLanguages as never,
      h.useCreateLanguage as never,
      h.useUpdateLanguage as never,
      h.useDeleteLanguage as never,
      [{ id: 'l1', name: 'French', proficiency: 'Fluent' }],
    );
    const { getByText, getByTestId } = await render(<LanguagesSection />);
    expect(getByText('French')).toBeTruthy();
    expect(getByText('Fluent')).toBeTruthy();

    await fireEvent.press(getByTestId('add-language-button'));
    await fireEvent.changeText(getByTestId('language-name-input'), 'German');
    await fireEvent.press(getByTestId('save-language-button'));

    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: 'German' }));
  });
});

describe('ProjectsSection', () => {
  it('lists a project with its role and dates, and sends a description', async () => {
    const { create } = arrange(
      h.useProjects as never,
      h.useCreateProject as never,
      h.useUpdateProject as never,
      h.useDeleteProject as never,
      [
        {
          id: 'p1',
          name: 'Trakwyn',
          role: 'Founder',
          url: null,
          startDate: '2024-01-01T00:00:00.000Z',
          endDate: null,
          description: null,
        },
      ],
    );
    const { getByText, getByTestId } = await render(<ProjectsSection />);
    expect(getByText('Trakwyn')).toBeTruthy();
    expect(getByText('Founder · 2024-01-01 – Present')).toBeTruthy();

    await fireEvent.press(getByTestId('add-project-button'));
    await fireEvent.changeText(getByTestId('project-name-input'), 'Clipper');
    await fireEvent.changeText(getByTestId('project-description-input'), 'A browser extension');
    await fireEvent.press(getByTestId('save-project-button'));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({ name: 'Clipper', description: 'A browser extension' }),
    );
  });
});

describe('AwardsSection', () => {
  it('lists an award with issuer and date, and deletes it', async () => {
    const { remove } = arrange(
      h.useAwards as never,
      h.useCreateAward as never,
      h.useUpdateAward as never,
      h.useDeleteAward as never,
      [
        {
          id: 'a1',
          title: 'Dean’s list',
          issuer: 'MIT',
          date: '2023-06-01T00:00:00.000Z',
          description: null,
        },
      ],
    );
    const { getByText, getByTestId } = await render(<AwardsSection />);
    expect(getByText('Dean’s list')).toBeTruthy();
    expect(getByText('MIT · 2023-06-01')).toBeTruthy();

    await fireEvent.press(getByTestId('delete-award-a1'));
    expect(remove).toHaveBeenCalledWith('a1');
  });

  it('requires a title', async () => {
    const { create } = arrange(
      h.useAwards as never,
      h.useCreateAward as never,
      h.useUpdateAward as never,
      h.useDeleteAward as never,
      [],
    );
    const { getByTestId } = await render(<AwardsSection />);
    await fireEvent.press(getByTestId('add-award-button'));
    await fireEvent.press(getByTestId('save-award-button'));
    expect(create).not.toHaveBeenCalled();
  });
});
