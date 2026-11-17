import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SparklesIcon } from 'lucide-react';
import { gqlClient } from '#/graphql/client';
import { ANALYTICS_EVENTS, captureEvent } from '#/lib/analytics';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import { useFormAction } from '#/hooks/useFormAction';
import { Button, Input, SubmitButton } from '@trakwyn/ui';
import {
  CREATE_SKILL,
  UPDATE_WORK_EXPERIENCE,
  skillsQueryOptions,
  workExperiencesQueryOptions,
} from '#/routes/_authenticated/profile/-components/profileQueries';
import {
  DISMISS_RESUME_GAP,
  ROLE_DESCRIPTION_MAX_CHARS,
  appendToDescription,
  resumeGapsQueryKey,
  resumeGapsQueryOptions,
  roleGapKey,
  type ResumeGapsData,
  type RoleWithoutMetrics,
} from '../-resumeGapsQueries';

interface ResumeGapsPanelProps {
  applicationId: string;
}

type GapKind = 'requirement' | 'metric';

const ROW_CLASS =
  'flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700';

function useGapActions(applicationId: string, onAdded: () => void) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: resumeGapsQueryKey(applicationId) });
  // What was answered, never what it says: no keyword or text leaves the device (JEF-349).
  const report = (kind: GapKind, answer: 'added' | 'dismissed') =>
    captureEvent(ANALYTICS_EVENTS.RESUME_GAP_ANSWERED, { kind, answer });

  const addSkill = useMutation({
    mutationFn: (name: string) => gqlClient.request(CREATE_SKILL, { input: { name } }),
    onSuccess: async () => {
      report('requirement', 'added');
      onAdded();
      await Promise.all([
        refresh(),
        qc.invalidateQueries({ queryKey: skillsQueryOptions.queryKey }),
      ]);
    },
  });

  const addMetric = useMutation({
    mutationFn: ({ role, line }: { role: RoleWithoutMetrics; line: string }) =>
      gqlClient.request(UPDATE_WORK_EXPERIENCE, {
        id: role.workExperienceId,
        input: { description: appendToDescription(role.description, line) },
      }),
    onSuccess: async () => {
      report('metric', 'added');
      onAdded();
      await Promise.all([
        refresh(),
        qc.invalidateQueries({ queryKey: workExperiencesQueryOptions.queryKey }),
      ]);
    },
  });

  const dismiss = useMutation({
    mutationFn: ({ key }: { key: string; kind: GapKind }) =>
      gqlClient.request<{ dismissResumeGap: ResumeGapsData['resumeGaps'] }>(DISMISS_RESUME_GAP, {
        applicationId,
        key,
      }),
    onSuccess: ({ dismissResumeGap }, { kind }) => {
      report(kind, 'dismissed');
      qc.setQueryData<ResumeGapsData>(resumeGapsQueryKey(applicationId), {
        resumeGaps: dismissResumeGap,
      });
    },
  });

  return { addSkill, addMetric, dismiss };
}

type Actions = ReturnType<typeof useGapActions>;

function RequirementRow({ requirement, actions }: { requirement: string; actions: Actions }) {
  const { t } = useLocale();
  const busy = actions.addSkill.isPending || actions.dismiss.isPending;
  return (
    <li className={ROW_CLASS}>
      <span className="text-sm text-gray-700 dark:text-gray-300">
        {t('resumeGaps.haveYouUsed')}{' '}
        <strong className="font-semibold text-gray-900 dark:text-gray-100">{requirement}</strong>?
      </span>
      <span className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => actions.addSkill.mutate(requirement)}
          aria-label={t('resumeGaps.addSkillLabel', { skill: requirement })}
        >
          {t('resumeGaps.yesAddSkill')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => actions.dismiss.mutate({ key: requirement, kind: 'requirement' })}
          aria-label={t('resumeGaps.dismissSkillLabel', { skill: requirement })}
        >
          {t('resumeGaps.no')}
        </Button>
      </span>
    </li>
  );
}

const metricLineSchema = z.object({ line: z.string().trim().min(1) });
type MetricLineForm = z.infer<typeof metricLineSchema>;

function RoleRow({ role, actions }: { role: RoleWithoutMetrics; actions: Actions }) {
  const { t } = useLocale();
  const form = useForm<MetricLineForm>({
    resolver: zodResolver(metricLineSchema),
    defaultValues: { line: '' },
  });
  const line = useWatch({ control: form.control, name: 'line' });
  const busy = actions.addMetric.isPending || actions.dismiss.isPending;
  const inputId = `resume-gap-metric-${role.workExperienceId}`;

  const { state, formProps } = useFormAction(form, async ({ line: value }, { resetFields }) => {
    // Without a figure the role would come straight back as the same question.
    if (!/\d/.test(value)) return t('resumeGaps.needsNumber');
    if (appendToDescription(role.description, value).length > ROLE_DESCRIPTION_MAX_CHARS) {
      return t('resumeGaps.descriptionFull');
    }
    try {
      await actions.addMetric.mutateAsync({ role, line: value });
      resetFields({ line: '' });
    } catch {
      // The panel renders the mutation's error once, below the list.
    }
    return null;
  });
  const problem = state.error;

  return (
    <li className="rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700">
      <label htmlFor={inputId} className="text-sm text-gray-700 dark:text-gray-300">
        {t('resumeGaps.roleHasNoNumbers', { title: role.title, company: role.company })}
      </label>
      <form {...formProps} className="mt-2 flex flex-wrap gap-2">
        <Input
          id={inputId}
          {...form.register('line')}
          placeholder={t('resumeGaps.metricPlaceholder')}
          className="min-w-0 flex-1 basis-56"
          invalid={!!problem}
          aria-describedby={problem ? `${inputId}-problem` : undefined}
        />
        <SubmitButton size="sm" variant="secondary" disabled={busy || !line.trim()}>
          {t('resumeGaps.addToProfile')}
        </SubmitButton>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            actions.dismiss.mutate({ key: roleGapKey(role.workExperienceId), kind: 'metric' })
          }
          aria-label={t('resumeGaps.skipRoleLabel', { title: role.title, company: role.company })}
        >
          {t('resumeGaps.skip')}
        </Button>
      </form>
      {problem && (
        <p id={`${inputId}-problem`} className="mt-1 text-xs text-red-600 dark:text-red-400">
          {problem}
        </p>
      )}
    </li>
  );
}

/**
 * "Strengthen this resume" (JEF-594): what the posting asks for that the
 * profile does not show, and which roles have no numbers. The AI may not
 * invent either, so the questions go to the user and a "yes" is saved to the
 * profile, where the next generated resume can use it truthfully.
 *
 * Nothing here calls AI, and nothing is written into an existing draft: the
 * user generates again (or edits) once the profile is fuller.
 */
export function ResumeGapsPanel({ applicationId }: ResumeGapsPanelProps) {
  const { t } = useLocale();
  const [added, setAdded] = useState(false);
  const { data } = useQuery(resumeGapsQueryOptions(applicationId));
  const actions = useGapActions(applicationId, () => setAdded(true));
  const gaps = data?.resumeGaps;
  if (!gaps) return null;

  const hasQuestions = gaps.requirementGaps.length + gaps.rolesWithoutMetrics.length > 0;
  // Nothing to ask, nothing just answered and nothing to explain: stay out of the way.
  if (!hasQuestions && !added && gaps.requirementsRead) return null;

  const failure = actions.addSkill.error ?? actions.addMetric.error ?? actions.dismiss.error;

  return (
    <section
      aria-labelledby="resume-gaps-title"
      className="mb-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
    >
      <h2
        id="resume-gaps-title"
        className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100"
      >
        <SparklesIcon size={16} aria-hidden="true" />
        {t('resumeGaps.title')}
      </h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('resumeGaps.intro')}</p>

      {!gaps.requirementsRead && (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{t('resumeGaps.notRead')}</p>
      )}

      {gaps.requirementGaps.length > 0 && (
        <div className="mt-3">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400">
            {t('resumeGaps.requirementsHeading')}
          </h3>
          <ul className="mt-1.5 space-y-1.5">
            {gaps.requirementGaps.map((requirement) => (
              <RequirementRow key={requirement} requirement={requirement} actions={actions} />
            ))}
          </ul>
        </div>
      )}

      {gaps.rolesWithoutMetrics.length > 0 && (
        <div className="mt-3">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400">
            {t('resumeGaps.metricsHeading')}
          </h3>
          <ul className="mt-1.5 space-y-1.5">
            {gaps.rolesWithoutMetrics.map((role) => (
              <RoleRow key={role.workExperienceId} role={role} actions={actions} />
            ))}
          </ul>
        </div>
      )}

      {added && (
        <p role="status" className="mt-3 text-sm text-green-700 dark:text-green-400">
          {t('resumeGaps.saved')}
        </p>
      )}
      {failure && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {getErrorMessage(failure)}
        </p>
      )}
    </section>
  );
}
