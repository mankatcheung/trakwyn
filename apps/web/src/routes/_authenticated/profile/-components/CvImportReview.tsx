import { useId, useState, type ReactNode } from 'react';
import { BriefcaseIcon, CheckIcon, GraduationCapIcon, PencilIcon, WrenchIcon } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  FormLabel,
  IconButton,
  Input,
  Select,
  Textarea,
} from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import {
  isEducationValid,
  isSkillValid,
  isWorkValid,
  setAllSelected,
  updateDraft,
  type CvDrafts,
  type Draft,
  type EducationValue,
  type SkillValue,
  type WorkValue,
} from './cvImportDrafts';

/**
 * The CV import's review step (JEF-461): what the API read, as rows to untick
 * and edit. Nothing here is saved; `CvImportDialog` sends the ticked rows.
 */

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const PROFICIENCIES = ['beginner', 'intermediate', 'advanced', 'expert'] as const;

interface CvImportReviewProps {
  drafts: CvDrafts;
  onChange: (next: CvDrafts) => void;
  truncated: boolean;
  disabled: boolean;
}

export function CvImportReview({ drafts, onChange, truncated, disabled }: CvImportReviewProps) {
  const { t, formatDate } = useLocale();

  const month = (value: string): string =>
    MONTH.test(value)
      ? formatDate(new Date(`${value}-01T00:00:00Z`), {
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        })
      : value;
  const range = (start: string, end: string): string =>
    `${month(start)} – ${end === '' ? t('experience.present') : month(end)}`;

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600 dark:text-gray-300">{t('cvImport.reviewIntro')}</p>
      {truncated && <Alert role="status">{t('cvImport.truncated')}</Alert>}

      <ReviewGroup<WorkValue>
        id="work"
        title={t('experience.workExperienceTitle')}
        icon={<BriefcaseIcon size={16} />}
        drafts={drafts.workExperiences}
        disabled={disabled}
        onChange={(workExperiences) => onChange({ ...drafts, workExperiences })}
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

      <ReviewGroup<EducationValue>
        id="education"
        title={t('experience.educationTitle')}
        icon={<GraduationCapIcon size={16} />}
        drafts={drafts.educations}
        disabled={disabled}
        onChange={(educations) => onChange({ ...drafts, educations })}
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
                <Input
                  id={id}
                  value={v.field}
                  onChange={(e) => update({ field: e.target.value })}
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
                  rows={2}
                  value={v.description}
                  onChange={(e) => update({ description: e.target.value })}
                />
              )}
            </Field>
          </div>
        )}
      />

      <ReviewGroup<SkillValue>
        id="skills"
        title={t('experience.skillsTitle')}
        icon={<WrenchIcon size={16} />}
        drafts={drafts.skills}
        disabled={disabled}
        onChange={(skills) => onChange({ ...drafts, skills })}
        labelOf={(v) => v.name}
        isValid={isSkillValid}
        summary={(v) => (
          <p className="text-sm text-gray-900 dark:text-gray-100">
            <span className="font-medium">{v.name}</span>
            {v.category && (
              <span className="text-gray-500 dark:text-gray-400"> · {v.category}</span>
            )}
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
    </div>
  );
}

interface FieldProps {
  label: string;
  className?: string;
  children: (id: string) => ReactNode;
}

/** A label tied to its input, with an id that is unique however many rows are open. */
function Field({ label, className, children }: FieldProps) {
  const id = useId();
  return (
    <div className={className}>
      <FormLabel htmlFor={id}>{label}</FormLabel>
      {children(id)}
    </div>
  );
}

interface DateFieldsProps {
  start: string;
  end: string;
  hint: string;
  onChange: (patch: { startDate?: string; endDate?: string }) => void;
}

function DateFields({ start, end, hint, onChange }: DateFieldsProps) {
  const { t } = useLocale();
  return (
    <>
      <Field label={t('experience.startDateLabel')}>
        {(id) => (
          <Input
            id={id}
            type="month"
            value={start}
            invalid={!MONTH.test(start)}
            onChange={(e) => onChange({ startDate: e.target.value })}
          />
        )}
      </Field>
      <Field label={t('experience.endDateLabel')}>
        {(id) => (
          <>
            <Input
              id={id}
              type="month"
              value={end}
              invalid={end !== '' && (!MONTH.test(end) || end < start)}
              onChange={(e) => onChange({ endDate: e.target.value })}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
          </>
        )}
      </Field>
    </>
  );
}

interface ReviewGroupProps<T> {
  id: string;
  title: string;
  icon: ReactNode;
  drafts: Draft<T>[];
  disabled: boolean;
  onChange: (next: Draft<T>[]) => void;
  labelOf: (value: T) => string;
  isValid: (value: T) => boolean;
  summary: (value: T) => ReactNode;
  fields: (value: T, update: (patch: Partial<T>) => void) => ReactNode;
}

function ReviewGroup<T>({
  id,
  title,
  icon,
  drafts,
  disabled,
  onChange,
  labelOf,
  isValid,
  summary,
  fields,
}: ReviewGroupProps<T>) {
  const { t } = useLocale();
  const [editing, setEditing] = useState<ReadonlySet<string>>(new Set());

  if (drafts.length === 0) return null;

  const selected = drafts.filter((draft) => draft.selected).length;
  const allSelected = selected === drafts.length;
  const toggleEditing = (draftId: string) =>
    setEditing((current) => {
      const next = new Set(current);
      if (!next.delete(draftId)) next.add(draftId);
      return next;
    });

  return (
    <section aria-labelledby={`cv-import-${id}`} className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3
          id={`cv-import-${id}`}
          className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100"
        >
          {icon} {title}
          <span className="font-normal text-gray-500 dark:text-gray-400">
            {selected}/{drafts.length}
          </span>
        </h3>
        <Button
          variant="link"
          size="sm"
          disabled={disabled}
          onClick={() => onChange(setAllSelected(drafts, !allSelected))}
        >
          {allSelected ? t('cvImport.selectNone') : t('cvImport.selectAll')}
        </Button>
      </div>
      <ul className="space-y-2">
        {drafts.map((draft) => {
          const valid = isValid(draft.value);
          const isEditing = editing.has(draft.id);
          const update = (patch: Partial<T>) =>
            onChange(
              updateDraft(drafts, draft.id, (current) => ({
                ...current,
                value: { ...current.value, ...patch },
              })),
            );
          return (
            <li
              key={draft.id}
              className={[
                'flex items-start gap-3 rounded-lg border p-3',
                draft.selected && !valid
                  ? 'border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10'
                  : 'border-gray-200 dark:border-gray-700',
                draft.selected ? '' : 'opacity-70',
              ].join(' ')}
            >
              <Checkbox
                className="mt-1"
                checked={draft.selected}
                disabled={disabled}
                aria-label={t('cvImport.include', { name: labelOf(draft.value) })}
                onChange={(e) =>
                  onChange(
                    updateDraft(drafts, draft.id, (current) => ({
                      ...current,
                      selected: e.target.checked,
                    })),
                  )
                }
              />
              <div className="min-w-0 flex-1 space-y-2">
                {isEditing ? fields(draft.value, update) : summary(draft.value)}
                {draft.alreadyInProfile && (
                  <Badge tone="gray">{t('cvImport.alreadyInProfile')}</Badge>
                )}
              </div>
              <IconButton
                label={isEditing ? t('common.done') : t('common.edit')}
                icon={isEditing ? <CheckIcon size={14} /> : <PencilIcon size={14} />}
                variant="subtle"
                disabled={disabled}
                onClick={() => toggleEditing(draft.id)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
