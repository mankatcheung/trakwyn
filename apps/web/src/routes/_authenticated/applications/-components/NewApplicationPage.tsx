import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { gqlClient } from '#/graphql/client';
import { useFormAction } from '#/hooks/useFormAction';
import { ERROR_CODES } from '#/constants';
import { UpgradePrompt } from '#/features/plans/components/UpgradePrompt';
import { getErrorMessage } from '#/lib/errors';
import { QuotaHint } from '#/features/quota/components/QuotaHint';
import { useQuotaState } from '#/features/quota/lib/contentQuota';
import { getGqlErrorCode } from '#/lib/graphqlError';
import { ANALYTICS_EVENTS, captureEvent } from '#/lib/analytics';
import { useLocale } from '#/lib/i18n';
import { StarIcon, XIcon } from 'lucide-react';
import { Alert, Checkbox, FormLabel, Input, SubmitButton, Textarea } from '@trakwyn/ui';
import { JdImportPanel } from './JdImportPanel';
import { POSTING_TEXT_MAX_CHARS, PostingTextField } from './PostingTextField';

const schema = z.object({
  company: z.string().min(1, 'Company is required'),
  role: z.string().min(1, 'Role is required'),
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

const CREATE_MUTATION = `
  mutation CreateApplication($input: CreateApplicationInput!) {
    createApplication(input: $input) { id }
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

export function NewApplicationPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const tagsFull = useQuotaState('tags', tags.length)?.level === 'full';
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
  });
  const {
    register,
    formState: { errors },
    setValue,
  } = form;

  const create = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      gqlClient.request<{ createApplication: { id: string } }>(CREATE_MUTATION, { input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });

  const { state, formProps } = useFormAction(form, async (data) => {
    const input = {
      company: data.company,
      role: data.role,
      ...(data.jobUrl ? { jobUrl: data.jobUrl } : {}),
      ...(data.location ? { location: data.location } : {}),
      ...(data.salaryRange ? { salaryRange: data.salaryRange } : {}),
      ...(data.description ? { description: data.description } : {}),
      ...(data.postingText?.trim() ? { postingText: data.postingText.trim() } : {}),
      ...(data.source ? { source: data.source } : {}),
      ...(data.followUpAt ? { followUpAt: data.followUpAt } : {}),
      starred: data.starred ?? false,
      tags,
    };
    try {
      const result = await create.mutateAsync(input);
      // What was created, never what it contains — no company, role or
      // description leaves the device (JEF-349).
      captureEvent(ANALYTICS_EVENTS.APPLICATION_CREATED, { has_tags: tags.length > 0 });
      await navigate({
        to: '/applications/$applicationId',
        params: { applicationId: result.createApplication.id },
      });
    } catch (err) {
      // The code rides along so the render below can tell "you are at your
      // plan's limit" from a failure.
      return { message: getErrorMessage(err), code: getGqlErrorCode(err) };
    }
  });

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-8">
      <div className="mb-6">
        <a
          href="/applications"
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          {t('applicationForm.backToApplications')}
        </a>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('applicationForm.newTitle')}
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
            <Input {...register('company')} invalid={!!errors.company} placeholder="Acme Corp" />
          </Field>
          <Field label={t('applicationForm.roleLabel')} error={errors.role?.message}>
            <Input {...register('role')} invalid={!!errors.role} placeholder="Senior Engineer" />
          </Field>
        </div>

        <Field label={t('applicationForm.jobUrlLabel')} error={errors.jobUrl?.message}>
          <Input
            {...register('jobUrl')}
            invalid={!!errors.jobUrl}
            placeholder="https://..."
            type="url"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('applicationForm.locationLabel')}>
            <Input {...register('location')} placeholder="Remote / San Francisco" />
          </Field>
          <Field label={t('applicationForm.salaryRangeLabel')}>
            <Input {...register('salaryRange')} placeholder="$120k–$160k" />
          </Field>
        </div>

        <Field label={t('applicationForm.descriptionLabel')}>
          <Textarea
            {...register('description')}
            className="h-28"
            placeholder="Job description, notes…"
          />
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
          <Checkbox {...register('starred')} id="starred-new" tone="yellow" />
          <label
            htmlFor="starred-new"
            className="flex cursor-pointer items-center gap-1.5 text-sm text-gray-700 select-none dark:text-gray-300"
          >
            <StarIcon size={14} className="text-yellow-400" />{' '}
            {t('applicationForm.starThisApplication')}
          </label>
        </div>

        {state.error &&
          (state.code === ERROR_CODES.QUOTA_EXCEEDED || state.code === ERROR_CODES.PLAN_REQUIRED ? (
            <div className="space-y-2">
              <UpgradePrompt message={state.error} />
              {/* Trashed applications are not freed until they are purged, which is the
                  dead end users hit with a full list and an apparently empty board (JEF-494). */}
              {state.code === ERROR_CODES.QUOTA_EXCEEDED && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('quota.trashNote')}</p>
              )}
            </div>
          ) : (
            <Alert>{state.error}</Alert>
          ))}

        <div className="flex gap-3 pt-2">
          <SubmitButton pendingLabel={t('applicationForm.saving')}>
            {t('applicationForm.saveApplication')}
          </SubmitButton>
          <a
            href="/applications"
            className="px-5 py-2 text-sm text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            {t('common.cancel')}
          </a>
        </div>
      </form>
    </div>
  );
}
