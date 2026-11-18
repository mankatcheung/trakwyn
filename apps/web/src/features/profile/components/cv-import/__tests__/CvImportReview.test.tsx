import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CvImportReview } from '#/features/profile/components/cv-import/CvImportReview';
import type { CvDrafts, Draft } from '#/features/profile/lib/cvImportDrafts';

const draft = <T,>(id: string, value: T, selected = true): Draft<T> => ({
  id,
  selected,
  alreadyInProfile: false,
  value,
});

const empty: CvDrafts = {
  workExperiences: [],
  educations: [],
  skills: [],
  certifications: [],
  languages: [],
  projects: [],
  awards: [],
};

const withContent: CvDrafts = {
  ...empty,
  workExperiences: [
    draft('w1', {
      company: 'Acme',
      title: 'Engineer',
      location: '',
      startDate: '2020-01',
      endDate: '',
      description: '',
    }),
  ],
  skills: [draft('s1', { name: 'TypeScript', category: '', proficiency: '' })],
  languages: [draft('l1', { name: 'French', proficiency: '' })],
};

function setup(drafts: CvDrafts, props: { truncated?: boolean; disabled?: boolean } = {}) {
  const onChange = vi.fn();
  render(
    <CvImportReview
      drafts={drafts}
      onChange={onChange}
      truncated={props.truncated ?? false}
      disabled={props.disabled ?? false}
    />,
  );
  return onChange;
}

describe('CvImportReview', () => {
  it('introduces the step and shows no groups for a CV with nothing in it', () => {
    setup(empty);

    expect(screen.getByText(/Tick what you want to add/)).toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('shows a group for each kind of entry that was read', () => {
    setup(withContent);

    expect(screen.getAllByRole('region')).toHaveLength(3);
    expect(screen.getByRole('checkbox', { name: /Engineer/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /TypeScript/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /French/ })).toBeChecked();
  });

  it('warns when the CV was cut short, and not otherwise', () => {
    const { unmount } = render(
      <CvImportReview drafts={empty} onChange={() => {}} truncated disabled={false} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/longer than we can read/);
    unmount();

    setup(empty);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('reports a change to one group with every other group kept', () => {
    const onChange = setup(withContent);

    fireEvent.click(screen.getByRole('checkbox', { name: /TypeScript/ }));

    const next = onChange.mock.calls[0][0] as CvDrafts;
    expect(next.skills[0].selected).toBe(false);
    expect(next.workExperiences).toBe(withContent.workExperiences);
    expect(next.languages).toBe(withContent.languages);
    expect(withContent.skills[0].selected).toBe(true);
  });

  it('reports each group under its own key', () => {
    const onChange = setup(withContent);

    fireEvent.click(screen.getByRole('checkbox', { name: /French/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Engineer/ }));

    expect((onChange.mock.calls[0][0] as CvDrafts).languages[0].selected).toBe(false);
    expect((onChange.mock.calls[1][0] as CvDrafts).workExperiences[0].selected).toBe(false);
  });

  it('locks the groups while the import is saving', () => {
    setup(withContent, { disabled: true });

    expect(screen.getByRole('checkbox', { name: /TypeScript/ })).toBeDisabled();
  });
});
