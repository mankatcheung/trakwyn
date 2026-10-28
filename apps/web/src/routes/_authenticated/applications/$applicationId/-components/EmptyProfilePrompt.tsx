import { Link, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { UserRoundIcon } from 'lucide-react';
import { Button } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import {
  skillsQueryOptions,
  workExperiencesQueryOptions,
} from '../../../profile/-components/profileQueries';

/**
 * Whether the user has neither work experience nor skills, which is what
 * resumes and cover letters are written from (JEF-460). While either list is
 * loading or failed to load this is `false`, so generating is never held up
 * by the check itself.
 */
export function useIsProfileEmpty(): boolean {
  const workExperiences = useQuery(workExperiencesQueryOptions).data?.workExperiences;
  const skills = useQuery(skillsQueryOptions).data?.skills;
  if (!workExperiences || !skills) return false;
  return workExperiences.length === 0 && skills.length === 0;
}

interface EmptyProfilePromptProps {
  /** Generate with the empty profile after all. */
  onGenerateAnyway: () => void;
}

/**
 * Shown in place of generating when the profile is empty: fill it in (and
 * come back here afterwards), or generate anyway.
 */
export function EmptyProfilePrompt({ onGenerateAnyway }: EmptyProfilePromptProps) {
  const { t } = useLocale();
  const here = useRouterState({ select: (s) => s.location.href });

  return (
    <div
      role="alert"
      className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20"
    >
      <p className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
        <UserRoundIcon size={16} className="shrink-0 text-amber-600 dark:text-amber-400" />
        {t('emptyProfilePrompt.title')}
      </p>
      <p className="mt-1 text-xs text-gray-700 dark:text-gray-300">
        {t('emptyProfilePrompt.body')}
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Link
          to="/profile"
          search={{ returnTo: here }}
          className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
        >
          {t('emptyProfilePrompt.fillIn')}
        </Link>
        <Button type="button" variant="secondary" size="sm" onClick={onGenerateAnyway}>
          {t('emptyProfilePrompt.generateAnyway')}
        </Button>
      </div>
    </div>
  );
}
