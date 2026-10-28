import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PencilIcon, Trash2Icon, WrenchIcon } from 'lucide-react';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { Alert, FormLabel, IconButton, Input, Select, Skeleton } from '@trakwyn/ui';
import {
  CREATE_SKILL,
  DELETE_SKILL,
  UPDATE_SKILL,
  skillsQueryOptions,
  type Skill,
} from './profileQueries';
import { FORM_CLASS, FieldError, FormActions, ProfileSection } from './ProfileSection';

export const SKILLS_SECTION_ID = 'skills';

const skillSchema = z.object({
  name: z.string().min(1, 'Required'),
  category: z.string().optional(),
  proficiency: z.string().optional(),
});

type SkillForm = z.infer<typeof skillSchema>;

const EMPTY_FORM: SkillForm = { name: '', category: '', proficiency: '' };

function toFormValues(skill: Skill): SkillForm {
  return {
    name: skill.name,
    category: skill.category ?? '',
    proficiency: skill.proficiency ?? '',
  };
}

function toInput(data: SkillForm) {
  return {
    ...data,
    category: data.category || undefined,
    proficiency: data.proficiency || undefined,
  };
}

export function SkillsSection() {
  const { t } = useLocale();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(skillsQueryOptions);
  const skills = data?.skills ?? [];

  const [editing, setEditing] = useState<Skill | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const form = useForm<SkillForm>({
    resolver: zodResolver(skillSchema),
    values: editing ? toFormValues(editing) : EMPTY_FORM,
  });
  const errors = form.formState.errors;

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    form.reset();
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: skillsQueryOptions.queryKey });

  const create = useMutation({
    mutationFn: (values: SkillForm) => gqlClient.request(CREATE_SKILL, { input: toInput(values) }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
  });

  const update = useMutation({
    mutationFn: (values: SkillForm) =>
      gqlClient.request(UPDATE_SKILL, { id: editing!.id, input: toInput(values) }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => gqlClient.request(DELETE_SKILL, { id }),
    onSuccess: invalidate,
  });

  return (
    <ProfileSection
      id={SKILLS_SECTION_ID}
      icon={<WrenchIcon size={18} />}
      title={t('experience.skillsTitle')}
      description={t('experience.skillsDescription')}
      onAdd={() => {
        setEditing(null);
        setFormOpen(true);
      }}
    >
      {isLoading ? (
        <Skeleton className="h-8 w-48 rounded-lg" />
      ) : (
        skills.length === 0 &&
        !formOpen && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('experience.noSkillsYet')}</p>
        )
      )}

      {skills.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <div
              key={skill.id}
              className="group flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <span className="text-gray-900 dark:text-gray-100">{skill.name}</span>
              {skill.proficiency && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  · {t(`experience.${skill.proficiency}`, { defaultValue: skill.proficiency })}
                </span>
              )}
              <IconButton
                label={t('common.edit')}
                icon={<PencilIcon size={12} />}
                size="sm"
                className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                onClick={() => {
                  setEditing(skill);
                  setFormOpen(true);
                }}
              />
              <IconButton
                label={t('common.delete')}
                icon={<Trash2Icon size={12} />}
                variant="danger"
                size="sm"
                className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                onClick={() => remove.mutate(skill.id)}
              />
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <form
          onSubmit={form.handleSubmit((values) =>
            editing ? update.mutate(values) : create.mutate(values),
          )}
          className={FORM_CLASS}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <FormLabel>{t('experience.skillLabel')}</FormLabel>
              <Input {...form.register('name')} invalid={!!errors.name} placeholder="TypeScript" />
              <FieldError message={errors.name?.message} />
            </div>
            <div>
              <FormLabel>{t('experience.categoryLabel')}</FormLabel>
              <Input {...form.register('category')} placeholder="Language" />
            </div>
            <div>
              <FormLabel>{t('experience.proficiencyLabel')}</FormLabel>
              <Select {...form.register('proficiency')}>
                <option value="">{t('experience.selectPlaceholder')}</option>
                <option value="beginner">{t('experience.beginner')}</option>
                <option value="intermediate">{t('experience.intermediate')}</option>
                <option value="advanced">{t('experience.advanced')}</option>
                <option value="expert">{t('experience.expert')}</option>
              </Select>
            </div>
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
