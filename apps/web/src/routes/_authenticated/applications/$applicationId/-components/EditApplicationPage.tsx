import { useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { useFormAction } from '#/hooks/useFormAction';
import { getErrorMessage } from '#/lib/errors';
import { QuotaHint } from '#/features/quota/components/QuotaHint';
import { useQuotaState } from '#/features/quota/lib/contentQuota';
import { useLocale } from '#/lib/i18n';
import { StarIcon, XIcon } from 'lucide-react';
import {
  Alert,
  Checkbox,
  FormLabel,
  Input,
  Select,
  Skeleton,
  SubmitButton,
  Textarea,
} from '@trakwyn/ui';
import { JdImportPanel } from '../../-components/JdImportPanel';
import { applicationQueryOptions } from '../-application-query';
import { POSTING_TEXT_MAX_CHARS, PostingTextField } from '../../-components/PostingTextField';
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
  jobUrl: z.url('Must be a valid URL').optional().or(z.literal('')),
  location: z.string().optional(),
  salaryRange: z.string().optional(),
  description: z.string().optional(),
  postingText: z
    .string()
    .max(POSTING_TEXT_MAX_CHARS, `Must be at most ${POSTING_TEXT_MAX_CHARS} characters`)
    .optional(),
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

  const queryClient = useQueryClient();
  const form = useForm<FormValues>({
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
          postingText: app.postingText ?? '',
          source: app.source ?? '',
          followUpAt: app.followUpAt ? app.followUpAt.slice(0, 10) : '',
          starred: app.starred,
        }
      : undefined,
  });

  const {
    register,
    formState: { errors },
    setValue,
  } = form;

  const update = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      gqlClient.request(UPDATE_MUTATION, { id: applicationId, input }),
    // The list and this application's own detail both show what was edited.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['applications'] }),
        queryClient.invalidateQueries({ queryKey: ['application', applicationId] }),
      ]),
  });

  const { state, formProps } = useFormAction(form, async (data) => {
    const input = {
      company: data.company,
      role: data.role,
      status: data.status,
      ...(data.jobUrl ? { jobUrl: data.jobUrl } : {}),
      ...(data.location ? { location: data.location } : {}),
      ...(data.salaryRange ? { salaryRange: data.salaryRange } : {}),
      ...(data.description ? { description: data.description } : {}),
      // Sent every time, so emptying the field clears a stale posting.
      postingText: data.postingText?.trim() ? data.postingText.trim() : null,
      ...(data.source ? { source: data.source } : { source: null }),
      ...(data.followUpAt ? { followUpAt: data.followUpAt } : { followUpAt: null }),
      starred: data.starred ?? false,
      tags,
    };
    try {
      await update.mutateAsync(input);
      await navigate({ to: '/applications/$applicationId', params: { applicationId } });
    } catch (err) {
      return getErrorMessage(err);
    }
  });

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
          if (parsed.postingText) setValue('postingText', parsed.postingText);
        }}
      />

      <form
        {...formProps}
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

        <PostingTextField
          registration={register('postingText')}
          error={errors.postingText?.message}
        />

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

        {state.error && <Alert>{state.error}</Alert>}

        <div className="flex gap-3 pt-2">
          <SubmitButton pendingLabel={t('applicationForm.saving')}>
            {t('applicationForm.saveChanges')}
          </SubmitButton>
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
