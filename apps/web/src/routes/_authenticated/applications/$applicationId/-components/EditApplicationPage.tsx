import { useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { queryClient } from '#/lib/queryClient';
import { getErrorMessage } from '#/lib/errors';
import { QuotaHint } from '#/components/QuotaHint';
import { useQuotaState } from '#/lib/contentQuota';
import { useLocale } from '#/lib/i18n';
import { StarIcon, XIcon } from 'lucide-react';
import { Alert, Button, Checkbox, FormLabel, Input, Select, Skeleton, Textarea } from '@trakwyn/ui';
import { JdImportPanel } from '../../-components/JdImportPanel';
import { applicationQueryOptions } from '../-application-query';
import { Route } from '../edit';

const APPLICATION_STATUSES = [
  'draft',
  'applied',
  'interviewing',
  'offered',
  'rejected',
  'accepted',
  'withdrawn',
] as const;

const schema = z.object({
  company: z.string().min(1, 'Company is required'),
  role: z.string().min(1, 'Role is required'),
  status: z.enum(APPLICATION_STATUSES),
  jobUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  location: z.string().optional(),
  salaryRange: z.string().optional(),
  description: z.string().optional(),
  source: z.string().optional(),
  followUpAt: z.string().optional(),
  starred: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

const UPDATE_MUTATION = `
  mutation UpdateApplication($id: ID!, $input: UpdateApplicationInput!) {
    updateApplication(id: $id, input: $input) { id }
  }
`;

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <FormLabel>{label}</FormLabel>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function EditApplicationPage() {
  const { t } = useLocale();
  const { applicationId } = Route.useParams();
  const navigate = useNavigate();
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const tagsFull = useQuotaState('tags', tags.length)?.level === 'full';

  const { data } = useQuery(applicationQueryOptions(applicationId));

  const app = data?.application;

  useEffect(() => {
    if (app?.tags) setTags(app.tags);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.tags?.join(',')]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    setValue,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: app
      ? {
          company: app.company,
          role: app.role,
          status: app.status as (typeof APPLICATION_STATUSES)[number],
          jobUrl: app.jobUrl ?? '',
          location: app.location ?? '',
          salaryRange: app.salaryRange ?? '',
          description: app.description ?? '',
          source: app.source ?? '',
          followUpAt: app.followUpAt ? app.followUpAt.slice(0, 10) : '',
          starred: app.starred,
        }
      : undefined,
  });

  const onSubmit = async (data: FormValues) => {
    try {
      const input = {
        company: data.company,
        role: data.role,
        status: data.status,
        ...(data.jobUrl ? { jobUrl: data.jobUrl } : {}),
        ...(data.location ? { location: data.location } : {}),
        ...(data.salaryRange ? { salaryRange: data.salaryRange } : {}),
        ...(data.description ? { description: data.description } : {}),
        ...(data.source ? { source: data.source } : { source: null }),
        ...(data.followUpAt ? { followUpAt: data.followUpAt } : { followUpAt: null }),
        starred: data.starred ?? false,
        tags,
      };
      await gqlClient.request(UPDATE_MUTATION, { id: applicationId, input });
      await queryClient.invalidateQueries({ queryKey: ['applications'] });
      await queryClient.invalidateQueries({ queryKey: ['application', applicationId] });
      await navigate({ to: '/applications/$applicationId', params: { applicationId } });
    } catch (err) {
      setError('root', { message: getErrorMessage(err) });
    }
  };

  if (!app)
    return (
      <div className="p-4 sm:p-8">
        <Skeleton className="h-8 w-64 rounded-sm" />
      </div>
    );

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-8">
      <div className="mb-6">
        <a
          href={`/applications/${applicationId}`}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          {t('applicationForm.backToApplication')}
        </a>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('applicationForm.editTitle')}
        </h1>
      </div>

      <JdImportPanel
        onFill={(parsed) => {
          if (parsed.company) setValue('company', parsed.company);
          if (parsed.role) setValue('role', parsed.role);
          if (parsed.location) setValue('location', parsed.location);
          if (parsed.salary) setValue('salaryRange', parsed.salary);
          if (parsed.description) setValue('description', parsed.description);
        }}
      />

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('applicationForm.companyLabel')} error={errors.company?.message}>
            <Input {...register('company')} invalid={!!errors.company} />
          </Field>
          <Field label={t('applicationForm.roleLabel')} error={errors.role?.message}>
            <Input {...register('role')} invalid={!!errors.role} />
          </Field>
        </div>

        <Field label={t('applicationForm.statusLabel')}>
          <Select {...register('status')}>
            {APPLICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t('applicationForm.jobUrlLabel')} error={errors.jobUrl?.message}>
          <Input {...register('jobUrl')} invalid={!!errors.jobUrl} type="url" />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('applicationForm.locationLabel')}>
            <Input {...register('location')} />
          </Field>
          <Field label={t('applicationForm.salaryRangeLabel')}>
            <Input {...register('salaryRange')} />
          </Field>
        </div>

        <Field label={t('applicationForm.descriptionLabel')}>
          <Textarea {...register('description')} className="h-28" />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('applicationForm.sourceLabel')}>
            <Input {...register('source')} placeholder="LinkedIn, referral, Indeed…" />
          </Field>
          <Field label={t('applicationForm.followUpDateLabel')}>
            <Input {...register('followUpAt')} type="date" />
          </Field>
        </div>

        <Field label={t('applicationForm.tagsLabel')}>
          <div className="space-y-2">
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                      className="hover:text-blue-600 dark:hover:text-blue-200"
                    >
                      <XIcon size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  const val = tagInput.trim().toLowerCase();
                  if (val && !tagsFull && !tags.includes(val)) setTags((prev) => [...prev, val]);
                  setTagInput('');
                }
              }}
              disabled={tagsFull}
              placeholder={t('applicationForm.tagPlaceholder')}
            />
            <QuotaHint resource="tags" used={tags.length} />
          </div>
        </Field>

        <div className="flex items-center gap-3">
          <Checkbox {...register('starred')} id="starred-edit" tone="yellow" />
          <label
            htmlFor="starred-edit"
            className="flex cursor-pointer items-center gap-1.5 text-sm text-gray-700 select-none dark:text-gray-300"
          >
            <StarIcon size={14} className="text-yellow-400" />{' '}
            {t('applicationForm.starThisApplication')}
          </label>
        </div>

        {errors.root && <Alert>{errors.root.message}</Alert>}

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('applicationForm.saving') : t('applicationForm.saveChanges')}
          </Button>
          <a
            href={`/applications/${applicationId}`}
            className="px-5 py-2 text-sm text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            {t('common.cancel')}
          </a>
        </div>
      </form>
    </div>
  );
}
