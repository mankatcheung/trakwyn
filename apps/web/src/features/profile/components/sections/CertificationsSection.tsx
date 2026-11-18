import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AwardIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { useFormAction } from '#/hooks/useFormAction';
import { Alert, FormLabel, IconButton, Input, Skeleton } from '@trakwyn/ui';
import {
  CREATE_CERTIFICATION,
  DELETE_CERTIFICATION,
  UPDATE_CERTIFICATION,
  certificationsQueryOptions,
  type Certification,
} from '../../graphql/certificationQueries';
import { FORM_CLASS, FieldError, FormActions, ProfileSection } from './ProfileSection';
import { deleteProfileItemWithUndo } from '../../lib/deleteProfileItemWithUndo';

export const CERTIFICATIONS_SECTION_ID = 'certifications';

const certificationSchema = z.object({
  name: z.string().min(1, 'Required'),
  issuer: z.string().optional(),
  issuedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  credentialUrl: z.string().optional(),
});

type CertificationForm = z.infer<typeof certificationSchema>;

const EMPTY_FORM: CertificationForm = {
  name: '',
  issuer: '',
  issuedAt: '',
  expiresAt: '',
  credentialUrl: '',
};

function toFormValues(cert: Certification): CertificationForm {
  return {
    name: cert.name,
    issuer: cert.issuer ?? '',
    issuedAt: cert.issuedAt?.slice(0, 10) ?? '',
    expiresAt: cert.expiresAt?.slice(0, 10) ?? '',
    credentialUrl: cert.credentialUrl ?? '',
  };
}

/** A blank field is sent as null, so editing a certification can clear it. */
function toInput(data: CertificationForm) {
  return {
    name: data.name,
    issuer: data.issuer?.trim() || null,
    issuedAt: data.issuedAt || null,
    expiresAt: data.expiresAt || null,
    credentialUrl: data.credentialUrl?.trim() || null,
  };
}

export function CertificationsSection() {
  const { t } = useLocale();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(certificationsQueryOptions);
  const certifications = data?.certifications ?? [];

  const [editing, setEditing] = useState<Certification | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const form = useForm<CertificationForm>({
    resolver: zodResolver(certificationSchema),
    values: editing ? toFormValues(editing) : EMPTY_FORM,
  });
  const errors = form.formState.errors;

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    form.reset();
    create.reset();
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: certificationsQueryOptions.queryKey });

  const create = useMutation({
    mutationFn: (values: CertificationForm) =>
      gqlClient.request(CREATE_CERTIFICATION, { input: toInput(values) }),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
  });

  const update = useMutation({
    mutationFn: (values: CertificationForm) =>
      gqlClient.request(UPDATE_CERTIFICATION, { id: editing!.id, input: toInput(values) }),
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
      queryKey: certificationsQueryOptions.queryKey,
      id,
      document: DELETE_CERTIFICATION,
      message: t('profile.itemDeletedToast'),
    });

  // The mutation keeps the request, the cache invalidation and `createError`
  // (shown by ProfileSection); the action only awaits it, so the submit button
  // stays pending until the request settles. A failure is already on the
  // mutation, so it is not returned as a second message.
  const { formProps } = useFormAction(form, async (values) => {
    try {
      await (editing ? update.mutateAsync(values) : create.mutateAsync(values));
    } catch {
      // Surfaced through `create.error` / `update.error`.
    }
  });

  return (
    <ProfileSection
      id={CERTIFICATIONS_SECTION_ID}
      icon={<AwardIcon size={18} />}
      title={t('experience.certificationsTitle')}
      description={t('experience.certificationsDescription')}
      createError={create.error ?? update.error}
      onAdd={() => {
        setEditing(null);
        setFormOpen(true);
      }}
    >
      {isLoading ? (
        <Skeleton className="h-8 w-48 rounded-lg" />
      ) : (
        certifications.length === 0 &&
        !formOpen && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('experience.noCertificationsYet')}
          </p>
        )
      )}

      {certifications.length > 0 && (
        <ul className="space-y-2">
          {certifications.map((cert) => (
            <li
              key={cert.id}
              className="group flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">{cert.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {[cert.issuer, cert.issuedAt?.slice(0, 7)].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex gap-1">
                <IconButton
                  label={t('common.edit')}
                  icon={<PencilIcon size={12} />}
                  size="sm"
                  onClick={() => {
                    setEditing(cert);
                    setFormOpen(true);
                  }}
                />
                <IconButton
                  label={t('common.delete')}
                  icon={<Trash2Icon size={12} />}
                  variant="danger"
                  size="sm"
                  onClick={() => remove(cert.id)}
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
              <FormLabel>{t('experience.certificationNameLabel')}</FormLabel>
              <Input
                {...form.register('name')}
                invalid={!!errors.name}
                placeholder={t('experience.certificationNamePlaceholder')}
              />
              <FieldError message={errors.name?.message} />
            </div>
            <div>
              <FormLabel>{t('experience.certificationIssuerLabel')}</FormLabel>
              <Input
                {...form.register('issuer')}
                placeholder={t('experience.certificationIssuerPlaceholder')}
              />
            </div>
            <div>
              <FormLabel>{t('experience.certificationIssuedLabel')}</FormLabel>
              <Input type="date" {...form.register('issuedAt')} />
            </div>
            <div>
              <FormLabel>{t('experience.certificationExpiresLabel')}</FormLabel>
              <Input type="date" {...form.register('expiresAt')} />
            </div>
            <div className="sm:col-span-2">
              <FormLabel>{t('experience.certificationUrlLabel')}</FormLabel>
              <Input {...form.register('credentialUrl')} placeholder="https://" />
            </div>
          </div>
          {errors.root?.message && <Alert>{errors.root.message}</Alert>}
          <FormActions editing={!!editing} onCancel={closeForm} />
        </form>
      )}
    </ProfileSection>
  );
}
