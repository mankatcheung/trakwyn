import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LanguagesIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { useFormAction } from '#/hooks/useFormAction';
import { Alert, FormLabel, IconButton, Input, Skeleton } from '@trakwyn/ui';
import {
  CREATE_LANGUAGE,
  DELETE_LANGUAGE,
  UPDATE_LANGUAGE,
  languagesQueryOptions,
  type Language,
} from '../../graphql/languageQueries';
import { FORM_CLASS, FieldError, FormActions, ProfileSection } from './ProfileSection';
import { deleteProfileItemWithUndo } from '../../lib/deleteProfileItemWithUndo';

export const LANGUAGES_SECTION_ID = 'languages';

const languageSchema = z.object({
  name: z.string().min(1, 'Required'),
  proficiency: z.string().optional(),
});

type LanguageForm = z.infer<typeof languageSchema>;

const EMPTY_FORM: LanguageForm = { name: '', proficiency: '' };

function toFormValues(language: Language): LanguageForm {
  return { name: language.name, proficiency: language.proficiency ?? '' };
}

/** A blank level is sent as null, so editing a language can clear it. */
function toInput(data: LanguageForm) {
  return { name: data.name, proficiency: data.proficiency?.trim() || null };
}

export function LanguagesSection() {
  const { t } = useLocale();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(languagesQueryOptions);
  const languages = data?.languages ?? [];

  const [editing, setEditing] = useState<Language | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const form = useForm<LanguageForm>({
    resolver: zodResolver(languageSchema),
    values: editing ? toFormValues(editing) : EMPTY_FORM,
  });
  const errors = form.formState.errors;

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    form.reset();
    create.reset();
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: languagesQueryOptions.queryKey });

  const create = useMutation({
    mutationFn: (values: LanguageForm) =>
      gqlClient.request(CREATE_LANGUAGE, { input: toInput(values) }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
  });

  const update = useMutation({
    mutationFn: (values: LanguageForm) =>
      gqlClient.request(UPDATE_LANGUAGE, { id: editing!.id, input: toInput(values) }),
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
      queryKey: languagesQueryOptions.queryKey,
      id,
      document: DELETE_LANGUAGE,
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
      id={LANGUAGES_SECTION_ID}
      icon={<LanguagesIcon size={18} />}
      title={t('experience.languagesTitle')}
      description={t('experience.languagesDescription')}
      createError={create.error ?? update.error}
      onAdd={() => {
        setEditing(null);
        setFormOpen(true);
      }}
    >
      {isLoading ? (
        <Skeleton className="h-8 w-48 rounded-lg" />
      ) : (
        languages.length === 0 &&
        !formOpen && (
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {t('experience.noLanguagesYet')}
          </p>
        )
      )}

      {languages.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {languages.map((language) => (
            <div
              key={language.id}
              className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800"
            >
              <span className="text-stone-900 dark:text-stone-100">{language.name}</span>
              {language.proficiency && (
                <span className="text-xs text-stone-500 dark:text-stone-400">
                  · {language.proficiency}
                </span>
              )}
              <IconButton
                label={t('common.edit')}
                icon={<PencilIcon size={12} />}
                size="sm"
                onClick={() => {
                  setEditing(language);
                  setFormOpen(true);
                }}
              />
              <IconButton
                label={t('common.delete')}
                icon={<Trash2Icon size={12} />}
                variant="danger"
                size="sm"
                onClick={() => remove(language.id)}
              />
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <form {...formProps} className={FORM_CLASS}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <FormLabel>{t('experience.languageNameLabel')}</FormLabel>
              <Input
                {...form.register('name')}
                invalid={!!errors.name}
                placeholder={t('experience.languageNamePlaceholder')}
              />
              <FieldError message={errors.name?.message} />
            </div>
            <div>
              <FormLabel>{t('experience.languageLevelLabel')}</FormLabel>
              <Input
                {...form.register('proficiency')}
                placeholder={t('experience.languageLevelPlaceholder')}
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
