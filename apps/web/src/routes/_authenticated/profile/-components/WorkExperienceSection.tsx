import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PencilIcon, Trash2Icon, BriefcaseIcon } from 'lucide-react';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { Alert, FormLabel, IconButton, Input, Skeleton, Textarea } from '@trakwyn/ui';
import {
  CREATE_WORK_EXPERIENCE,
  DELETE_WORK_EXPERIENCE,
  UPDATE_WORK_EXPERIENCE,
  workExperiencesQueryOptions,
  type WorkExperience,
} from './profileQueries';
import { ENTRY_CLASS, FORM_CLASS, FieldError, FormActions, ProfileSection } from './ProfileSection';

export const WORK_EXPERIENCE_SECTION_ID = 'work-experience';

const workExperienceSchema = z.object({
  company: z.string().min(1, 'Required'),
  title: z.string().min(1, 'Required'),
  location: z.string().optional(),
  startDate: z.string().min(1, 'Required'),
  endDate: z.string().optional(),
  description: z.string().optional(),
});

type WorkExperienceForm = z.infer<typeof workExperienceSchema>;

const EMPTY_FORM: WorkExperienceForm = {
  company: '',
  title: '',
  location: '',
  startDate: '',
  endDate: '',
  description: '',
};

function toFormValues(we: WorkExperience): WorkExperienceForm {
  return {
    company: we.company,
    title: we.title,
    location: we.location ?? '',
    startDate: we.startDate.slice(0, 10),
    endDate: we.endDate?.slice(0, 10) ?? '',
    description: we.description ?? '',
  };
}

function toInput(data: WorkExperienceForm) {
  return {
    ...data,
    location: data.location || undefined,
    endDate: data.endDate || undefined,
    description: data.description || undefined,
  };
}

export function WorkExperienceSection() {
  const { t } = useLocale();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(workExperiencesQueryOptions);
  const workExperiences = data?.workExperiences ?? [];

  const [editing, setEditing] = useState<WorkExperience | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const form = useForm<WorkExperienceForm>({
    resolver: zodResolver(workExperienceSchema),
    values: editing ? toFormValues(editing) : EMPTY_FORM,
  });
  const errors = form.formState.errors;

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    form.reset();
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: workExperiencesQueryOptions.queryKey });

  const create = useMutation({
    mutationFn: (values: WorkExperienceForm) =>
      gqlClient.request(CREATE_WORK_EXPERIENCE, { input: toInput(values) }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
  });

  const update = useMutation({
    mutationFn: (values: WorkExperienceForm) =>
      gqlClient.request(UPDATE_WORK_EXPERIENCE, { id: editing!.id, input: toInput(values) }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => gqlClient.request(DELETE_WORK_EXPERIENCE, { id }),
    onSuccess: invalidate,
  });

  return (
    <ProfileSection
      id={WORK_EXPERIENCE_SECTION_ID}
      icon={<BriefcaseIcon size={18} />}
      title={t('experience.workExperienceTitle')}
      description={t('experience.workExperienceDescription')}
      onAdd={() => {
        setEditing(null);
        setFormOpen(true);
      }}
    >
      {isLoading ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : (
        workExperiences.length === 0 &&
        !formOpen && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('experience.noWorkExperiencesYet')}
          </p>
        )
      )}

      {workExperiences.map((we) => (
        <div key={we.id} className={ENTRY_CLASS}>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {t('experience.titleAtCompany', { title: we.title, company: we.company })}
            </p>
            {we.location && (
              <p className="text-xs text-gray-500 dark:text-gray-400">{we.location}</p>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {we.startDate.slice(0, 10)} –{' '}
              {we.endDate ? we.endDate.slice(0, 10) : t('experience.present')}
            </p>
            {we.description && (
              <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                {we.description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <IconButton
              label={t('common.edit')}
              icon={<PencilIcon size={14} />}
              onClick={() => {
                setEditing(we);
                setFormOpen(true);
              }}
            />
            <IconButton
              label={t('common.delete')}
              icon={<Trash2Icon size={14} />}
              variant="danger"
              onClick={() => remove.mutate(we.id)}
            />
          </div>
        </div>
      ))}

      {formOpen && (
        <form
          onSubmit={form.handleSubmit((values) =>
            editing ? update.mutate(values) : create.mutate(values),
          )}
          className={FORM_CLASS}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <FormLabel>{t('experience.companyLabel')}</FormLabel>
              <Input
                {...form.register('company')}
                invalid={!!errors.company}
                placeholder="Acme Corp"
              />
              <FieldError message={errors.company?.message} />
            </div>
            <div>
              <FormLabel>{t('experience.titleLabel')}</FormLabel>
              <Input
                {...form.register('title')}
                invalid={!!errors.title}
                placeholder="Software Engineer"
              />
              <FieldError message={errors.title?.message} />
            </div>
            <div>
              <FormLabel>{t('experience.locationLabel')}</FormLabel>
              <Input {...form.register('location')} placeholder="San Francisco, CA" />
            </div>
            <div>
              <FormLabel>{t('experience.startDateLabel')}</FormLabel>
              <Input type="date" {...form.register('startDate')} invalid={!!errors.startDate} />
              <FieldError message={errors.startDate?.message} />
            </div>
            <div>
              <FormLabel>{t('experience.endDateLabel')}</FormLabel>
              <Input type="date" {...form.register('endDate')} />
            </div>
          </div>
          <div>
            <FormLabel>{t('experience.descriptionLabel')}</FormLabel>
            <Textarea
              {...form.register('description')}
              rows={3}
              placeholder={t('experience.workDescriptionPlaceholder')}
            />
          </div>
          {errors.root?.message && <Alert>{errors.root.message}</Alert>}
          <FormActions
            submitting={form.formState.isSubmitting}
            editing={!!editing}
            onCancel={closeForm}
          />
        </form>
      )}
    </ProfileSection>
  );
}
