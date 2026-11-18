import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { EducationValue, ProjectValue, WorkValue } from '../../../../lib/cvImportDrafts';
import {
  EducationReviewGroup,
  ProjectsReviewGroup,
  WorkReviewGroup,
} from '../ExperienceReviewGroups';
import { Harness } from './reviewHarness';
import { draft, edit, isInvalid, type as typeInto } from './reviewHelpers';

const work = (over: Partial<WorkValue> = {}): WorkValue => ({
  company: 'Acme',
  title: 'Engineer',
  location: 'Berlin',
  startDate: '2020-01',
  endDate: '2021-06',
  description: 'Built things',
  ...over,
});

const education = (over: Partial<EducationValue> = {}): EducationValue => ({
  institution: 'MIT',
  degree: 'BSc',
  field: 'Physics',
  startDate: '2015-09',
  endDate: '2019-06',
  description: '',
  ...over,
});

const project = (over: Partial<ProjectValue> = {}): ProjectValue => ({
  name: 'CLI',
  role: 'Maintainer',
  url: '',
  startDate: '2021-03',
  endDate: '',
  description: 'Open source',
  ...over,
});

describe('WorkReviewGroup', () => {
  it('renders nothing for an empty list', () => {
    const { container } = render(<Harness Group={WorkReviewGroup} initial={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('summarises title, company, dates, location and description', () => {
    render(<Harness Group={WorkReviewGroup} initial={[draft(work())]} />);
    expect(screen.getByText('Engineer at Acme')).toBeInTheDocument();
    expect(screen.getByText(/Jan 2020 – Jun 2021 · Berlin/)).toBeInTheDocument();
    expect(screen.getByText('Built things')).toBeInTheDocument();
  });

  it('says Present for an open end, and drops a blank location and description', () => {
    render(
      <Harness
        Group={WorkReviewGroup}
        initial={[draft(work({ endDate: '', location: '', description: '' }))]}
      />,
    );
    expect(screen.getByText('Jan 2020 – Present')).toBeInTheDocument();
    expect(screen.queryByText('Built things')).toBeNull();
  });

  it('edits every field of the row', () => {
    const onChange = vi.fn();
    render(<Harness Group={WorkReviewGroup} initial={[draft(work())]} onChange={onChange} />);
    edit();
    typeInto('Company *', 'Globex');
    typeInto('Title *', 'Lead');
    typeInto('Location', 'Paris');
    typeInto('Start Date *', '2019-05');
    typeInto('End Date', '2022-02');
    typeInto('Description', 'Led');
    expect(onChange.mock.lastCall![0][0].value).toEqual(
      work({
        company: 'Globex',
        title: 'Lead',
        location: 'Paris',
        startDate: '2019-05',
        endDate: '2022-02',
        description: 'Led',
      }),
    );
  });

  it('flags a blank company and title while editing', () => {
    render(
      <Harness Group={WorkReviewGroup} initial={[draft(work({ company: ' ', title: '' }))]} />,
    );
    edit();
    expect(isInvalid(screen.getByLabelText('Company *'))).toBe(true);
    expect(isInvalid(screen.getByLabelText('Title *'))).toBe(true);
  });

  it('returns to the summary on Done', () => {
    render(<Harness Group={WorkReviewGroup} initial={[draft(work())]} />);
    edit();
    expect(screen.queryByText('Engineer at Acme')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText('Engineer at Acme')).toBeInTheDocument();
  });

  it('un-ticks a row and shows the already-in-profile badge', () => {
    render(
      <Harness
        Group={WorkReviewGroup}
        initial={[draft(work(), { alreadyInProfile: true, selected: false })]}
      />,
    );
    expect(screen.getByText('Already in your profile')).toBeInTheDocument();
    const box = screen.getByRole('checkbox', { name: 'Include Engineer at Acme' });
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(box).toBeChecked();
  });

  it('selects all, then none, from the group button', () => {
    render(
      <Harness
        Group={WorkReviewGroup}
        initial={[draft(work()), draft(work({ company: 'B' }), { selected: false })]}
      />,
    );
    expect(screen.getByText('1/2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByText('2/2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Select none' }));
    expect(screen.getByText('0/2')).toBeInTheDocument();
  });

  it('marks a ticked invalid row, but not an unticked one', () => {
    const { container } = render(
      <Harness
        Group={WorkReviewGroup}
        initial={[draft(work({ company: '' })), draft(work({ company: '' }), { selected: false })]}
      />,
    );
    const rows = container.querySelectorAll('li');
    expect(rows[0]).toHaveClass('border-red-300');
    expect(rows[1]).not.toHaveClass('border-red-300');
    expect(rows[1]).toHaveClass('opacity-70');
  });

  it('disables the checkbox, edit button and select-all when disabled', () => {
    render(<Harness Group={WorkReviewGroup} initial={[draft(work())]} disabled />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Select none' })).toBeDisabled();
  });
});

describe('EducationReviewGroup', () => {
  it('summarises institution, degree, field and dates', () => {
    render(<Harness Group={EducationReviewGroup} initial={[draft(education())]} />);
    expect(screen.getByText('MIT')).toBeInTheDocument();
    expect(screen.getByText(/BSc in Physics · Sep 2015 – Jun 2019/)).toBeInTheDocument();
  });

  it('leaves out the degree separator when there is neither degree nor field', () => {
    render(
      <Harness
        Group={EducationReviewGroup}
        initial={[draft(education({ degree: '', field: '' }))]}
      />,
    );
    expect(screen.getByText('Sep 2015 – Jun 2019')).toBeInTheDocument();
  });

  it('shows a degree alone, or a field alone', () => {
    render(
      <Harness
        Group={EducationReviewGroup}
        initial={[draft(education({ field: '' })), draft(education({ degree: '' }))]}
      />,
    );
    expect(screen.getByText(/^BSc · /)).toBeInTheDocument();
    expect(screen.getByText(/^in Physics · /)).toBeInTheDocument();
  });

  it('edits every field of the row', () => {
    const onChange = vi.fn();
    render(
      <Harness Group={EducationReviewGroup} initial={[draft(education())]} onChange={onChange} />,
    );
    edit();
    typeInto('Institution *', 'Oxford');
    typeInto('Degree', 'MSc');
    typeInto('Field', 'Maths');
    typeInto('Start Date *', '2016-01');
    typeInto('End Date', '2018-01');
    typeInto('Description', 'Thesis');
    expect(onChange.mock.lastCall![0][0].value).toEqual(
      education({
        institution: 'Oxford',
        degree: 'MSc',
        field: 'Maths',
        startDate: '2016-01',
        endDate: '2018-01',
        description: 'Thesis',
      }),
    );
  });

  it('flags a blank institution', () => {
    render(
      <Harness Group={EducationReviewGroup} initial={[draft(education({ institution: '' }))]} />,
    );
    edit();
    expect(isInvalid(screen.getByLabelText('Institution *'))).toBe(true);
  });
});

describe('ProjectsReviewGroup', () => {
  it('summarises name, role, dates and description', () => {
    render(<Harness Group={ProjectsReviewGroup} initial={[draft(project())]} />);
    expect(screen.getByText('CLI')).toBeInTheDocument();
    expect(screen.getByText('Maintainer · Mar 2021 – Present')).toBeInTheDocument();
    expect(screen.getByText('Open source')).toBeInTheDocument();
  });

  it('drops the dates when there is no start, and the description when blank', () => {
    render(
      <Harness
        Group={ProjectsReviewGroup}
        initial={[draft(project({ startDate: '', description: '' }))]}
      />,
    );
    expect(screen.getByText('Maintainer')).toBeInTheDocument();
    expect(screen.queryByText('Open source')).toBeNull();
  });

  it('edits every field of the row', () => {
    const onChange = vi.fn();
    render(
      <Harness Group={ProjectsReviewGroup} initial={[draft(project())]} onChange={onChange} />,
    );
    edit();
    typeInto('Project *', 'Tool');
    typeInto('Your role', 'Author');
    typeInto('Start date', '2020-02');
    typeInto('End date', '2022-03');
    typeInto('Link', 'https://x.test');
    typeInto('Description', 'Desc');
    expect(onChange.mock.lastCall![0][0].value).toEqual(
      project({
        name: 'Tool',
        role: 'Author',
        startDate: '2020-02',
        endDate: '2022-03',
        url: 'https://x.test',
        description: 'Desc',
      }),
    );
  });

  it('flags a blank name and an end before the start', () => {
    render(
      <Harness
        Group={ProjectsReviewGroup}
        initial={[draft(project({ name: '', startDate: '2021-06', endDate: '2021-01' }))]}
      />,
    );
    edit();
    expect(isInvalid(screen.getByLabelText('Project *'))).toBe(true);
    expect(isInvalid(screen.getByLabelText('End date'))).toBe(true);
  });

  it('accepts an open end and a blank start', () => {
    render(
      <Harness
        Group={ProjectsReviewGroup}
        initial={[draft(project({ startDate: '', endDate: '2020-01' }))]}
      />,
    );
    edit();
    expect(isInvalid(screen.getByLabelText('End date'))).toBe(false);
  });
});
