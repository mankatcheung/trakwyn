import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PencilIcon, Trash2Icon, TrophyIcon } from 'lucide-react';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { useFormAction } from '#/lib/useFormAction';
import { Alert, FormLabel, IconButton, Input, Skeleton, Textarea } from '@trakwyn/ui';
import {
  CREATE_AWARD,
  DELETE_AWARD,
  UPDATE_AWARD,
  awardsQueryOptions,
  type Award,
} from './profileQueries';
import { FORM_CLASS, FieldError, FormActions, ProfileSection } from './ProfileSection';

export const AWARDS_SECTION_ID = 'awards';

const awardSchema = z.object({
  title: z.string().min(1, 'Required'),
  issuer: z.string().optional(),
  date: z.string().optional(),
  description: z.string().optional(),
});

type AwardForm = z.infer<typeof awardSchema>;

const EMPTY_FORM: AwardForm = { title: '', issuer: '', date: '', description: '' };

function toFormValues(award: Award): AwardForm {
  return {
    title: award.title,
    issuer: award.issuer ?? '',
    date: award.date?.slice(0, 10) ?? '',
    description: award.description ?? '',
  };
}

/** A blank field is sent as null, so editing an award can clear it. */
function toInput(data: AwardForm) {
  return {
    title: data.title,
    issuer: data.issuer?.trim() || null,
    date: data.date || null,
    description: data.description?.trim() || null,
  };
}

export function AwardsSection() {
  const { t } = useLocale();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(awardsQueryOptions);
  const awards = data?.awards ?? [];

  const [editing, setEditing] = useState<Award | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const form = useForm<AwardForm>({
    resolver: zodResolver(awardSchema),
    values: editing ? toFormValues(editing) : EMPTY_FORM,
  });
  const errors = form.formState.errors;

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    form.reset();
    create.reset();
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: awardsQueryOptions.queryKey });

  const create = useMutation({
    mutationFn: (values: AwardForm) => gqlClient.request(CREATE_AWARD, { input: toInput(values) }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
  });

  const update = useMutation({
    mutationFn: (values: AwardForm) =>
      gqlClient.request(UPDATE_AWARD, { id: editing!.id, input: toInput(values) }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => gqlClient.request(DELETE_AWARD, { id }),
    onSuccess: invalidate,
  });

  // The mutations keep the request, the cache invalidation and `createError`
  // (shown by ProfileSection); the action only awaits them, so the submit
  // button stays pending until the request settles. A failure is already on
  // the mutation, so it is not returned as a second message.
  const { formProps } = useFormAction(form, async (values) => {
    try {
      await (editing ? update.mutateAsync(values) : create.mutateAsync(values));
    } catch {
      // Surfaced through the mutation's `error`.
    }
  });

  return (
    <ProfileSection
      id={AWARDS_SECTION_ID}
      icon={<TrophyIcon size={18} />}
      title={t('experience.awardsTitle')}
      description={t('experience.awardsDescription')}
      createError={create.error ?? update.error}
      onAdd={() => {
        setEditing(null);
        setFormOpen(true);
      }}
    >
      {isLoading ? (
        <Skeleton className="h-8 w-48 rounded-lg" />
      ) : (
        awards.length === 0 &&
        !formOpen && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('experience.noAwardsYet')}</p>
        )
      )}

      {awards.length > 0 && (
        <ul className="space-y-2">
          {awards.map((award) => (
            <li
              key={award.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">{award.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {[award.issuer, award.date?.slice(0, 7)].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex gap-1">
                <IconButton
                  label={t('common.edit')}
                  icon={<PencilIcon size={12} />}
                  size="sm"
                  onClick={() => {
                    setEditing(award);
                    setFormOpen(true);
                  }}
                />
                <IconButton
                  label={t('common.delete')}
                  icon={<Trash2Icon size={12} />}
                  variant="danger"
                  size="sm"
                  onClick={() => remove.mutate(award.id)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {formOpen && (
        <form {...formProps} className={FORM_CLASS}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <FormLabel>{t('experience.awardTitleLabel')}</FormLabel>
              <Input
                {...form.register('title')}
                invalid={!!errors.title}
                placeholder={t('experience.awardTitlePlaceholder')}
              />
              <FieldError message={errors.title?.message} />
            </div>
            <div>
              <FormLabel>{t('experience.awardIssuerLabel')}</FormLabel>
              <Input
                {...form.register('issuer')}
                placeholder={t('experience.awardIssuerPlaceholder')}
              />
            </div>
            <div className="sm:col-span-2">
              <FormLabel>{t('experience.awardDateLabel')}</FormLabel>
              <Input type="date" {...form.register('date')} />
            </div>
            <div className="sm:col-span-2">
              <FormLabel>{t('experience.descriptionLabel')}</FormLabel>
              <Textarea
                {...form.register('description')}
                rows={3}
                placeholder={t('experience.awardDescriptionPlaceholder')}
              />
            </div>
          </div>
          {errors.root?.message && <Alert>{errors.root.message}</Alert>}
          <FormActions editing={!!editing} onCancel={closeForm} />
        </form>
      )}
    </ProfileSection>
  );
}
