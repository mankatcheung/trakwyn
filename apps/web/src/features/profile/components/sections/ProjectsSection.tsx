import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PencilIcon, RocketIcon, Trash2Icon } from 'lucide-react';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { useFormAction } from '#/hooks/useFormAction';
import { Alert, FormLabel, IconButton, Input, Skeleton, Textarea } from '@trakwyn/ui';
import {
  CREATE_PROJECT,
  DELETE_PROJECT,
  UPDATE_PROJECT,
  projectsQueryOptions,
  type Project,
} from '../../graphql/profileQueries';
import { FORM_CLASS, FieldError, FormActions, ProfileSection } from './ProfileSection';
import { deleteProfileItemWithUndo } from '../../lib/deleteProfileItemWithUndo';

export const PROJECTS_SECTION_ID = 'projects';

const projectSchema = z.object({
  name: z.string().min(1, 'Required'),
  role: z.string().optional(),
  url: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  description: z.string().optional(),
});

type ProjectForm = z.infer<typeof projectSchema>;

const EMPTY_FORM: ProjectForm = {
  name: '',
  role: '',
  url: '',
  startDate: '',
  endDate: '',
  description: '',
};

function toFormValues(project: Project): ProjectForm {
  return {
    name: project.name,
    role: project.role ?? '',
    url: project.url ?? '',
    startDate: project.startDate?.slice(0, 10) ?? '',
    endDate: project.endDate?.slice(0, 10) ?? '',
    description: project.description ?? '',
  };
}

/** A blank field is sent as null, so editing a project can clear it. */
function toInput(data: ProjectForm) {
  return {
    name: data.name,
    role: data.role?.trim() || null,
    url: data.url?.trim() || null,
    startDate: data.startDate || null,
    endDate: data.endDate || null,
    description: data.description?.trim() || null,
  };
}

export function ProjectsSection() {
  const { t } = useLocale();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(projectsQueryOptions);
  const projects = data?.projects ?? [];

  const [editing, setEditing] = useState<Project | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const form = useForm<ProjectForm>({
    resolver: zodResolver(projectSchema),
    values: editing ? toFormValues(editing) : EMPTY_FORM,
  });
  const errors = form.formState.errors;

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    form.reset();
    create.reset();
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: projectsQueryOptions.queryKey });

  const create = useMutation({
    mutationFn: (values: ProjectForm) =>
      gqlClient.request(CREATE_PROJECT, { input: toInput(values) }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
  });

  const update = useMutation({
    mutationFn: (values: ProjectForm) =>
      gqlClient.request(UPDATE_PROJECT, { id: editing!.id, input: toInput(values) }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
  });

  // A hard delete behind an undo toast (JEF-625): the row leaves the list at
  // once, and the request goes out when the toast closes.
  const remove = (id: string) =>
    deleteProfileItemWithUndo({
      qc,
      queryKey: projectsQueryOptions.queryKey,
      id,
      document: DELETE_PROJECT,
      message: t('profile.itemDeletedToast'),
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
      id={PROJECTS_SECTION_ID}
      icon={<RocketIcon size={18} />}
      title={t('experience.projectsTitle')}
      description={t('experience.projectsDescription')}
      createError={create.error ?? update.error}
      onAdd={() => {
        setEditing(null);
        setFormOpen(true);
      }}
    >
      {isLoading ? (
        <Skeleton className="h-8 w-48 rounded-lg" />
      ) : (
        projects.length === 0 &&
        !formOpen && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('experience.noProjectsYet')}
          </p>
        )
      )}

      {projects.length > 0 && (
        <ul className="space-y-2">
          {projects.map((project) => (
            <li
              key={project.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">{project.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {[project.role, project.startDate?.slice(0, 7)].filter(Boolean).join(' · ')}
                </p>
                {project.description && (
                  <p className="mt-1 whitespace-pre-line text-gray-700 dark:text-gray-300">
                    {project.description}
                  </p>
                )}
              </div>
              <div className="flex gap-1">
                <IconButton
                  label={t('common.edit')}
                  icon={<PencilIcon size={12} />}
                  size="sm"
                  onClick={() => {
                    setEditing(project);
                    setFormOpen(true);
                  }}
                />
                <IconButton
                  label={t('common.delete')}
                  icon={<Trash2Icon size={12} />}
                  variant="danger"
                  size="sm"
                  onClick={() => remove(project.id)}
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
              <FormLabel>{t('experience.projectNameLabel')}</FormLabel>
              <Input
                {...form.register('name')}
                invalid={!!errors.name}
                placeholder={t('experience.projectNamePlaceholder')}
              />
              <FieldError message={errors.name?.message} />
            </div>
            <div>
              <FormLabel>{t('experience.projectRoleLabel')}</FormLabel>
              <Input
                {...form.register('role')}
                placeholder={t('experience.projectRolePlaceholder')}
              />
            </div>
            <div>
              <FormLabel>{t('experience.projectStartLabel')}</FormLabel>
              <Input type="date" {...form.register('startDate')} />
            </div>
            <div>
              <FormLabel>{t('experience.projectEndLabel')}</FormLabel>
              <Input type="date" {...form.register('endDate')} />
            </div>
            <div className="sm:col-span-2">
              <FormLabel>{t('experience.projectUrlLabel')}</FormLabel>
              <Input {...form.register('url')} placeholder="https://" />
            </div>
            <div className="sm:col-span-2">
              <FormLabel>{t('experience.descriptionLabel')}</FormLabel>
              <Textarea
                {...form.register('description')}
                rows={4}
                placeholder={t('experience.projectDescriptionPlaceholder')}
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
