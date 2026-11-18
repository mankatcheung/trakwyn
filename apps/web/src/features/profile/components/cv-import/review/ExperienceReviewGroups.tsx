import { BriefcaseIcon, GraduationCapIcon, RocketIcon } from 'lucide-react';
import { Input, Textarea } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import { useReviewDates } from '../../../hooks/useReviewDates';
import {
  type Draft,
  type EducationValue,
  isEducationValid,
  isProjectValid,
  isWorkValid,
  type ProjectValue,
  type WorkValue,
} from '../../../lib/cvImportDrafts';
import { DateFields, Field, MonthField } from './ReviewFields';
import { ReviewGroup } from './ReviewGroup';

interface WorkReviewGroupProps {
  drafts: Draft<WorkValue>[];
  disabled: boolean;
  onChange: (next: Draft<WorkValue>[]) => void;
}

export function WorkReviewGroup({ drafts, disabled, onChange }: WorkReviewGroupProps) {
  const { t } = useLocale();
  const { range } = useReviewDates();
  return (
    <ReviewGroup<WorkValue>
      id="work"
      title={t('experience.workExperienceTitle')}
      icon={<BriefcaseIcon size={16} />}
      drafts={drafts}
      disabled={disabled}
      onChange={onChange}
      labelOf={(v) => t('experience.titleAtCompany', { title: v.title, company: v.company })}
      isValid={isWorkValid}
      summary={(v) => (
        <>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {t('experience.titleAtCompany', { title: v.title, company: v.company })}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {range(v.startDate, v.endDate)}
            {v.location && ` · ${v.location}`}
          </p>
          {v.description && (
            <p className="mt-1 line-clamp-2 text-xs text-gray-600 dark:text-gray-300">
              {v.description}
            </p>
          )}
        </>
      )}
      fields={(v, update) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('experience.companyLabel')}>
            {(id) => (
              <Input
                id={id}
                value={v.company}
                invalid={v.company.trim() === ''}
                onChange={(e) => update({ company: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('experience.titleLabel')}>
            {(id) => (
              <Input
                id={id}
                value={v.title}
                invalid={v.title.trim() === ''}
                onChange={(e) => update({ title: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('experience.locationLabel')} className="sm:col-span-2">
            {(id) => (
              <Input
                id={id}
                value={v.location}
                onChange={(e) => update({ location: e.target.value })}
              />
            )}
          </Field>
          <DateFields
            start={v.startDate}
            end={v.endDate}
            onChange={update}
            hint={t('cvImport.endBlankPresent')}
          />
          <Field label={t('experience.descriptionLabel')} className="sm:col-span-2">
            {(id) => (
              <Textarea
                id={id}
                rows={3}
                value={v.description}
                onChange={(e) => update({ description: e.target.value })}
              />
            )}
          </Field>
        </div>
      )}
    />
  );
}

interface EducationReviewGroupProps {
  drafts: Draft<EducationValue>[];
  disabled: boolean;
  onChange: (next: Draft<EducationValue>[]) => void;
}

export function EducationReviewGroup({ drafts, disabled, onChange }: EducationReviewGroupProps) {
  const { t } = useLocale();
  const { range } = useReviewDates();
  return (
    <ReviewGroup<EducationValue>
      id="education"
      title={t('experience.educationTitle')}
      icon={<GraduationCapIcon size={16} />}
      drafts={drafts}
      disabled={disabled}
      onChange={onChange}
      labelOf={(v) => v.institution}
      isValid={isEducationValid}
      summary={(v) => (
        <>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{v.institution}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {[v.degree, v.field && t('experience.inField', { field: v.field })]
              .filter(Boolean)
              .join(' ')}
            {(v.degree || v.field) && ' · '}
            {range(v.startDate, v.endDate)}
          </p>
        </>
      )}
      fields={(v, update) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('experience.institutionLabel')} className="sm:col-span-2">
            {(id) => (
              <Input
                id={id}
                value={v.institution}
                invalid={v.institution.trim() === ''}
                onChange={(e) => update({ institution: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('experience.degreeLabel')}>
            {(id) => (
              <Input
                id={id}
                value={v.degree}
                onChange={(e) => update({ degree: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('experience.fieldLabel')}>
            {(id) => (
              <Input id={id} value={v.field} onChange={(e) => update({ field: e.target.value })} />
            )}
          </Field>
          <DateFields
            start={v.startDate}
            end={v.endDate}
            onChange={update}
            hint={t('cvImport.endBlankPresent')}
          />
          <Field label={t('experience.descriptionLabel')} className="sm:col-span-2">
            {(id) => (
              <Textarea
                id={id}
                rows={2}
                value={v.description}
                onChange={(e) => update({ description: e.target.value })}
              />
            )}
          </Field>
        </div>
      )}
    />
  );
}

interface ProjectsReviewGroupProps {
  drafts: Draft<ProjectValue>[];
  disabled: boolean;
  onChange: (next: Draft<ProjectValue>[]) => void;
}

export function ProjectsReviewGroup({ drafts, disabled, onChange }: ProjectsReviewGroupProps) {
  const { t } = useLocale();
  const { range } = useReviewDates();
  return (
    <ReviewGroup<ProjectValue>
      id="projects"
      title={t('experience.projectsTitle')}
      icon={<RocketIcon size={16} />}
      drafts={drafts}
      disabled={disabled}
      onChange={onChange}
      labelOf={(v) => v.name}
      isValid={isProjectValid}
      summary={(v) => (
        <>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{v.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {[v.role, v.startDate && range(v.startDate, v.endDate)].filter(Boolean).join(' · ')}
          </p>
          {v.description && (
            <p className="mt-1 line-clamp-2 text-xs text-gray-600 dark:text-gray-300">
              {v.description}
            </p>
          )}
        </>
      )}
      fields={(v, update) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('experience.projectNameLabel')}>
            {(id) => (
              <Input
                id={id}
                value={v.name}
                invalid={v.name.trim() === ''}
                onChange={(e) => update({ name: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('experience.projectRoleLabel')}>
            {(id) => (
              <Input id={id} value={v.role} onChange={(e) => update({ role: e.target.value })} />
            )}
          </Field>
          <MonthField
            label={t('experience.projectStartLabel')}
            value={v.startDate}
            onChange={(startDate) => update({ startDate })}
          />
          <MonthField
            label={t('experience.projectEndLabel')}
            value={v.endDate}
            invalid={v.startDate !== '' && v.endDate !== '' && v.endDate < v.startDate}
            onChange={(endDate) => update({ endDate })}
          />
          <Field label={t('experience.projectUrlLabel')} className="sm:col-span-2">
            {(id) => (
              <Input id={id} value={v.url} onChange={(e) => update({ url: e.target.value })} />
            )}
          </Field>
          <Field label={t('experience.descriptionLabel')} className="sm:col-span-2">
            {(id) => (
              <Textarea
                id={id}
                rows={3}
                value={v.description}
                onChange={(e) => update({ description: e.target.value })}
              />
            )}
          </Field>
        </div>
      )}
    />
  );
}
