import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PencilIcon, Trash2Icon, GraduationCapIcon } from 'lucide-react';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { Alert, FormLabel, IconButton, Input, Skeleton, Textarea } from '@trakwyn/ui';
import {
  CREATE_EDUCATION,
  DELETE_EDUCATION,
  UPDATE_EDUCATION,
  educationsQueryOptions,
  type Education,
} from './profileQueries';
import { ENTRY_CLASS, FORM_CLASS, FieldError, FormActions, ProfileSection } from './ProfileSection';

export const EDUCATION_SECTION_ID = 'education';

const educationSchema = z.object({
  institution: z.string().min(1, 'Required'),
  degree: z.string().optional(),
  field: z.string().optional(),
  startDate: z.string().min(1, 'Required'),
  endDate: z.string().optional(),
  description: z.string().optional(),
});

type EducationForm = z.infer<typeof educationSchema>;

const EMPTY_FORM: EducationForm = {
  institution: '',
  degree: '',
  field: '',
  startDate: '',
  endDate: '',
  description: '',
};

function toFormValues(edu: Education): EducationForm {
  return {
    institution: edu.institution,
    degree: edu.degree ?? '',
    field: edu.field ?? '',
    startDate: edu.startDate.slice(0, 10),
    endDate: edu.endDate?.slice(0, 10) ?? '',
    description: edu.description ?? '',
  };
}

function toInput(data: EducationForm) {
  return {
    ...data,
    degree: data.degree || undefined,
    field: data.field || undefined,
    endDate: data.endDate || undefined,
    description: data.description || undefined,
  };
}

export function EducationSection() {
  const { t } = useLocale();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(educationsQueryOptions);
  const educations = data?.educations ?? [];

  const [editing, setEditing] = useState<Education | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const form = useForm<EducationForm>({
    resolver: zodResolver(educationSchema),
    values: editing ? toFormValues(editing) : EMPTY_FORM,
  });
  const errors = form.formState.errors;

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    form.reset();
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: educationsQueryOptions.queryKey });

  const create = useMutation({
    mutationFn: (values: EducationForm) =>
      gqlClient.request(CREATE_EDUCATION, { input: toInput(values) }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
  });

  const update = useMutation({
    mutationFn: (values: EducationForm) =>
      gqlClient.request(UPDATE_EDUCATION, { id: editing!.id, input: toInput(values) }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => gqlClient.request(DELETE_EDUCATION, { id }),
    onSuccess: invalidate,
  });

  return (
    <ProfileSection
      id={EDUCATION_SECTION_ID}
      icon={<GraduationCapIcon size={18} />}
      title={t('experience.educationTitle')}
      description={t('experience.educationDescription')}
      onAdd={() => {
        setEditing(null);
        setFormOpen(true);
      }}
    >
      {isLoading ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : (
        educations.length === 0 &&
        !formOpen && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('experience.noEducationYet')}
          </p>
        )
      )}

      {educations.map((edu) => (
        <div key={edu.id} className={ENTRY_CLASS}>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {edu.institution}
              {edu.degree && ` — ${edu.degree}`}
              {edu.field && ` ${t('experience.inField', { field: edu.field })}`}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {edu.startDate.slice(0, 10)} –{' '}
              {edu.endDate ? edu.endDate.slice(0, 10) : t('experience.present')}
            </p>
            {edu.description && (
              <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                {edu.description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <IconButton
              label={t('common.edit')}
              icon={<PencilIcon size={14} />}
              onClick={() => {
                setEditing(edu);
                setFormOpen(true);
              }}
            />
            <IconButton
              label={t('common.delete')}
              icon={<Trash2Icon size={14} />}
              variant="danger"
              onClick={() => remove.mutate(edu.id)}
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
              <FormLabel>{t('experience.institutionLabel')}</FormLabel>
              <Input
                {...form.register('institution')}
                invalid={!!errors.institution}
                placeholder="MIT"
              />
              <FieldError message={errors.institution?.message} />
            </div>
            <div>
              <FormLabel>{t('experience.degreeLabel')}</FormLabel>
              <Input {...form.register('degree')} placeholder="B.S." />
            </div>
            <div>
              <FormLabel>{t('experience.fieldLabel')}</FormLabel>
              <Input {...form.register('field')} placeholder="Computer Science" />
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
              placeholder={t('experience.educationDescriptionPlaceholder')}
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
