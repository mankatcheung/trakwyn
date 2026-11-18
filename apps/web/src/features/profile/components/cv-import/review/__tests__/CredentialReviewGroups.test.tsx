import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type {
  AwardValue,
  CertificationValue,
  LanguageValue,
  SkillValue,
} from '../../../../lib/cvImportDrafts';
import {
  AwardsReviewGroup,
  CertificationsReviewGroup,
  LanguagesReviewGroup,
  SkillsReviewGroup,
} from '../CredentialReviewGroups';
import { Harness } from './reviewHarness';
import { draft, edit, isInvalid, type as typeInto } from './reviewHelpers';

const skill = (over: Partial<SkillValue> = {}): SkillValue => ({
  name: 'TypeScript',
  category: 'Languages',
  proficiency: 'expert',
  ...over,
});
const cert = (over: Partial<CertificationValue> = {}): CertificationValue => ({
  name: 'CKA',
  issuer: 'CNCF',
  issuedAt: '2023-05',
  expiresAt: '',
  credentialUrl: '',
  ...over,
});
const award = (over: Partial<AwardValue> = {}): AwardValue => ({
  title: 'Excellence',
  issuer: 'Acme',
  date: '2022-06',
  description: '',
  ...over,
});
const language = (over: Partial<LanguageValue> = {}): LanguageValue => ({
  name: 'French',
  proficiency: 'Fluent',
  ...over,
});

describe('SkillsReviewGroup', () => {
  it('summarises name, category and a translated proficiency', () => {
    render(<Harness Group={SkillsReviewGroup} initial={[draft(skill())]} />);
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText(/Languages/)).toBeInTheDocument();
    expect(screen.getByText(/Expert/)).toBeInTheDocument();
  });

  it('shows an unknown proficiency as it came, and omits blank category and proficiency', () => {
    render(
      <Harness
        Group={SkillsReviewGroup}
        initial={[
          draft(skill({ proficiency: 'guru' })),
          draft(skill({ name: 'Go', category: '', proficiency: '' })),
        ]}
      />,
    );
    expect(screen.getByText(/guru/)).toBeInTheDocument();
    expect(screen.getByText('Go').parentElement?.textContent).toBe('Go');
  });

  it('edits name, category and proficiency', () => {
    const onChange = vi.fn();
    render(<Harness Group={SkillsReviewGroup} initial={[draft(skill())]} onChange={onChange} />);
    edit();
    typeInto('Skill *', 'Rust');
    typeInto('Category', 'Systems');
    typeInto('Proficiency', 'beginner');
    expect(onChange.mock.lastCall![0][0].value).toEqual({
      name: 'Rust',
      category: 'Systems',
      proficiency: 'beginner',
    });
    expect(screen.getAllByRole('option')).toHaveLength(5);
  });

  it('flags a blank name', () => {
    render(<Harness Group={SkillsReviewGroup} initial={[draft(skill({ name: '' }))]} />);
    edit();
    expect(isInvalid(screen.getByLabelText('Skill *'))).toBe(true);
  });
});

describe('CertificationsReviewGroup', () => {
  it('summarises name, issuer and the issue month', () => {
    render(<Harness Group={CertificationsReviewGroup} initial={[draft(cert())]} />);
    expect(screen.getByText('CKA')).toBeInTheDocument();
    expect(screen.getByText('CNCF · May 2023')).toBeInTheDocument();
  });

  it('drops a missing issue date', () => {
    render(<Harness Group={CertificationsReviewGroup} initial={[draft(cert({ issuedAt: '' }))]} />);
    expect(screen.getByText('CNCF')).toBeInTheDocument();
  });

  it('edits every field', () => {
    const onChange = vi.fn();
    render(
      <Harness Group={CertificationsReviewGroup} initial={[draft(cert())]} onChange={onChange} />,
    );
    edit();
    typeInto('Certification *', 'CKAD');
    typeInto('Issuer', 'Linux Foundation');
    typeInto('Issued', '2022-01');
    typeInto('Expires', '2025-01');
    typeInto('Credential link', 'https://c.test');
    expect(onChange.mock.lastCall![0][0].value).toEqual({
      name: 'CKAD',
      issuer: 'Linux Foundation',
      issuedAt: '2022-01',
      expiresAt: '2025-01',
      credentialUrl: 'https://c.test',
    });
  });

  it('flags a blank name and an expiry before the issue date', () => {
    render(
      <Harness
        Group={CertificationsReviewGroup}
        initial={[draft(cert({ name: '', issuedAt: '2023-05', expiresAt: '2023-01' }))]}
      />,
    );
    edit();
    expect(isInvalid(screen.getByLabelText('Certification *'))).toBe(true);
    expect(isInvalid(screen.getByLabelText('Expires'))).toBe(true);
  });

  it('does not flag an expiry when either date is blank', () => {
    render(
      <Harness
        Group={CertificationsReviewGroup}
        initial={[draft(cert({ issuedAt: '', expiresAt: '2020-01' }))]}
      />,
    );
    edit();
    expect(isInvalid(screen.getByLabelText('Expires'))).toBe(false);
  });
});

describe('AwardsReviewGroup', () => {
  it('summarises title, issuer and month', () => {
    render(<Harness Group={AwardsReviewGroup} initial={[draft(award())]} />);
    expect(screen.getByText('Excellence')).toBeInTheDocument();
    expect(screen.getByText('Acme · Jun 2022')).toBeInTheDocument();
  });

  it('drops a missing date', () => {
    render(<Harness Group={AwardsReviewGroup} initial={[draft(award({ date: '' }))]} />);
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });

  it('edits every field and flags a blank title', () => {
    const onChange = vi.fn();
    render(
      <Harness
        Group={AwardsReviewGroup}
        initial={[draft(award({ title: '' }))]}
        onChange={onChange}
      />,
    );
    edit();
    expect(isInvalid(screen.getByLabelText('Award *'))).toBe(true);
    typeInto('Award *', 'Best');
    typeInto('Awarded by', 'Globex');
    typeInto('Date', '2021-11');
    expect(onChange.mock.lastCall![0][0].value).toMatchObject({
      title: 'Best',
      issuer: 'Globex',
      date: '2021-11',
    });
  });
});

describe('re-rendering with the same props', () => {
  it('keeps the output of every group', () => {
    const onChange = vi.fn();
    const skills = [draft(skill())];
    const certs = [draft(cert())];
    const awards = [draft(award())];
    const languages = [draft(language())];
    const ui = () => (
      <>
        <SkillsReviewGroup drafts={skills} disabled={false} onChange={onChange} />
        <CertificationsReviewGroup drafts={certs} disabled={false} onChange={onChange} />
        <AwardsReviewGroup drafts={awards} disabled={false} onChange={onChange} />
        <LanguagesReviewGroup drafts={languages} disabled={false} onChange={onChange} />
      </>
    );
    const { container, rerender } = render(ui());
    const before = container.innerHTML;
    rerender(ui());
    expect(container.innerHTML).toBe(before);
  });
});

describe('LanguagesReviewGroup', () => {
  it('summarises name and level', () => {
    render(<Harness Group={LanguagesReviewGroup} initial={[draft(language())]} />);
    expect(screen.getByText('French')).toBeInTheDocument();
    expect(screen.getByText(/Fluent/)).toBeInTheDocument();
  });

  it('omits a blank level', () => {
    render(
      <Harness Group={LanguagesReviewGroup} initial={[draft(language({ proficiency: '' }))]} />,
    );
    expect(screen.getByText('French').parentElement?.textContent).toBe('French');
  });

  it('edits name and level, and flags a blank name', () => {
    const onChange = vi.fn();
    render(
      <Harness
        Group={LanguagesReviewGroup}
        initial={[draft(language({ name: '' }))]}
        onChange={onChange}
      />,
    );
    edit();
    expect(isInvalid(screen.getByLabelText('Language *'))).toBe(true);
    typeInto('Language *', 'German');
    typeInto('Level', 'B2');
    expect(onChange.mock.lastCall![0][0].value).toEqual({ name: 'German', proficiency: 'B2' });
  });
});
