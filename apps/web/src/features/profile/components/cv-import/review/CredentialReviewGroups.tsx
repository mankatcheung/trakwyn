import { AwardIcon, LanguagesIcon, TrophyIcon, WrenchIcon } from 'lucide-react';
import { Input, Select } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import { useReviewDates } from '../../../hooks/useReviewDates';
import {
  type AwardValue,
  type CertificationValue,
  type Draft,
  isAwardValid,
  isCertificationValid,
  isLanguageValid,
  isSkillValid,
  type LanguageValue,
  type SkillValue,
} from '../../../lib/cvImportDrafts';
import { Field, MonthField } from './ReviewFields';
import { ReviewGroup } from './ReviewGroup';

const PROFICIENCIES = ['beginner', 'intermediate', 'advanced', 'expert'] as const;

interface SkillsReviewGroupProps {
  drafts: Draft<SkillValue>[];
  disabled: boolean;
  onChange: (next: Draft<SkillValue>[]) => void;
}

export function SkillsReviewGroup({ drafts, disabled, onChange }: SkillsReviewGroupProps) {
  const { t } = useLocale();
  return (
    <ReviewGroup<SkillValue>
      id="skills"
      title={t('experience.skillsTitle')}
      icon={<WrenchIcon size={16} />}
      drafts={drafts}
      disabled={disabled}
      onChange={onChange}
      labelOf={(v) => v.name}
      isValid={isSkillValid}
      summary={(v) => (
        <p className="text-sm text-gray-900 dark:text-gray-100">
          <span className="font-medium">{v.name}</span>
          {v.category && <span className="text-gray-500 dark:text-gray-400"> · {v.category}</span>}
          {v.proficiency && (
            <span className="text-gray-500 dark:text-gray-400">
              {' · '}
              {t(`experience.${v.proficiency}`, { defaultValue: v.proficiency })}
            </span>
          )}
        </p>
      )}
      fields={(v, update) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={t('experience.skillLabel')}>
            {(id) => (
              <Input
                id={id}
                value={v.name}
                invalid={v.name.trim() === ''}
                onChange={(e) => update({ name: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('experience.categoryLabel')}>
            {(id) => (
              <Input
                id={id}
                value={v.category}
                onChange={(e) => update({ category: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('experience.proficiencyLabel')}>
            {(id) => (
              <Select
                id={id}
                value={v.proficiency}
                onChange={(e) => update({ proficiency: e.target.value })}
              >
                <option value="">{t('experience.selectPlaceholder')}</option>
                {PROFICIENCIES.map((level) => (
                  <option key={level} value={level}>
                    {t(`experience.${level}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      )}
    />
  );
}

interface CertificationsReviewGroupProps {
  drafts: Draft<CertificationValue>[];
  disabled: boolean;
  onChange: (next: Draft<CertificationValue>[]) => void;
}

export function CertificationsReviewGroup({
  drafts,
  disabled,
  onChange,
}: CertificationsReviewGroupProps) {
  const { t } = useLocale();
  const { month } = useReviewDates();
  return (
    <ReviewGroup<CertificationValue>
      id="certifications"
      title={t('experience.certificationsTitle')}
      icon={<AwardIcon size={16} />}
      drafts={drafts}
      disabled={disabled}
      onChange={onChange}
      labelOf={(v) => v.name}
      isValid={isCertificationValid}
      summary={(v) => (
        <>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{v.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {[v.issuer, v.issuedAt && month(v.issuedAt)].filter(Boolean).join(' · ')}
          </p>
        </>
      )}
      fields={(v, update) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('experience.certificationNameLabel')}>
            {(id) => (
              <Input
                id={id}
                value={v.name}
                invalid={v.name.trim() === ''}
                onChange={(e) => update({ name: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('experience.certificationIssuerLabel')}>
            {(id) => (
              <Input
                id={id}
                value={v.issuer}
                onChange={(e) => update({ issuer: e.target.value })}
              />
            )}
          </Field>
          <MonthField
            label={t('experience.certificationIssuedLabel')}
            value={v.issuedAt}
            onChange={(issuedAt) => update({ issuedAt })}
          />
          <MonthField
            label={t('experience.certificationExpiresLabel')}
            value={v.expiresAt}
            invalid={v.issuedAt !== '' && v.expiresAt !== '' && v.expiresAt < v.issuedAt}
            onChange={(expiresAt) => update({ expiresAt })}
          />
          <Field label={t('experience.certificationUrlLabel')} className="sm:col-span-2">
            {(id) => (
              <Input
                id={id}
                value={v.credentialUrl}
                onChange={(e) => update({ credentialUrl: e.target.value })}
              />
            )}
          </Field>
        </div>
      )}
    />
  );
}

interface AwardsReviewGroupProps {
  drafts: Draft<AwardValue>[];
  disabled: boolean;
  onChange: (next: Draft<AwardValue>[]) => void;
}

export function AwardsReviewGroup({ drafts, disabled, onChange }: AwardsReviewGroupProps) {
  const { t } = useLocale();
  const { month } = useReviewDates();
  return (
    <ReviewGroup<AwardValue>
      id="awards"
      title={t('experience.awardsTitle')}
      icon={<TrophyIcon size={16} />}
      drafts={drafts}
      disabled={disabled}
      onChange={onChange}
      labelOf={(v) => v.title}
      isValid={isAwardValid}
      summary={(v) => (
        <>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{v.title}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {[v.issuer, v.date && month(v.date)].filter(Boolean).join(' · ')}
          </p>
        </>
      )}
      fields={(v, update) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('experience.awardTitleLabel')}>
            {(id) => (
              <Input
                id={id}
                value={v.title}
                invalid={v.title.trim() === ''}
                onChange={(e) => update({ title: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('experience.awardIssuerLabel')}>
            {(id) => (
              <Input
                id={id}
                value={v.issuer}
                onChange={(e) => update({ issuer: e.target.value })}
              />
            )}
          </Field>
          <MonthField
            label={t('experience.awardDateLabel')}
            value={v.date}
            onChange={(date) => update({ date })}
          />
        </div>
      )}
    />
  );
}

interface LanguagesReviewGroupProps {
  drafts: Draft<LanguageValue>[];
  disabled: boolean;
  onChange: (next: Draft<LanguageValue>[]) => void;
}

export function LanguagesReviewGroup({ drafts, disabled, onChange }: LanguagesReviewGroupProps) {
  const { t } = useLocale();
  return (
    <ReviewGroup<LanguageValue>
      id="languages"
      title={t('experience.languagesTitle')}
      icon={<LanguagesIcon size={16} />}
      drafts={drafts}
      disabled={disabled}
      onChange={onChange}
      labelOf={(v) => v.name}
      isValid={isLanguageValid}
      summary={(v) => (
        <p className="text-sm text-gray-900 dark:text-gray-100">
          <span className="font-medium">{v.name}</span>
          {v.proficiency && (
            <span className="text-gray-500 dark:text-gray-400"> · {v.proficiency}</span>
          )}
        </p>
      )}
      fields={(v, update) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('experience.languageNameLabel')}>
            {(id) => (
              <Input
                id={id}
                value={v.name}
                invalid={v.name.trim() === ''}
                onChange={(e) => update({ name: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('experience.languageLevelLabel')}>
            {(id) => (
              <Input
                id={id}
                value={v.proficiency}
                onChange={(e) => update({ proficiency: e.target.value })}
              />
            )}
          </Field>
        </div>
      )}
    />
  );
}
