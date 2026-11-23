import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, CheckCircle2Icon } from 'lucide-react';
import { ProgressBar } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import {
  MIN_SKILLS_FOR_COMPLETE_PROFILE,
  type ProfileCheck,
  type ProfileCompleteness,
} from '../lib/profileCompleteness';
import { WORK_EXPERIENCE_SECTION_ID } from './sections/WorkExperienceSection';
import { EDUCATION_SECTION_ID } from './sections/EducationSection';
import { SKILLS_SECTION_ID } from './sections/SkillsSection';

/** Which profile page section completes each check. */
// eslint-disable-next-line react-refresh/only-export-components -- non-component export; move to its own file when next touched (JEF-639).
export const CHECK_SECTION: Record<ProfileCheck, string> = {
  role: WORK_EXPERIENCE_SECTION_ID,
  roleDescription: WORK_EXPERIENCE_SECTION_ID,
  education: EDUCATION_SECTION_ID,
  skills: SKILLS_SECTION_ID,
};

const CHECK_LABEL_KEY: Record<ProfileCheck, string> = {
  role: 'profile.next.role',
  roleDescription: 'profile.next.roleDescription',
  education: 'profile.next.education',
  skills: 'profile.next.skills',
};

interface CompletenessMeterProps {
  completeness: ProfileCompleteness;
}

/** Percentage bar plus a link to the section that completes the next missing check. */
export function CompletenessMeter({ completeness }: CompletenessMeterProps) {
  const { t } = useLocale();
  const { percent, nextStep } = completeness;
  const label = t('profile.completeness', { percent });

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-stone-900 dark:text-stone-100">{label}</p>
      <ProgressBar value={percent} max={100} aria-label={label} />
      {nextStep ? (
        <Link
          to="/profile"
          hash={CHECK_SECTION[nextStep]}
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-800 hover:underline dark:text-blue-400"
        >
          {t(CHECK_LABEL_KEY[nextStep], { min: MIN_SKILLS_FOR_COMPLETE_PROFILE })}
          <ArrowRightIcon size={14} />
        </Link>
      ) : (
        <p className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
          <CheckCircle2Icon size={14} /> {t('profile.complete')}
        </p>
      )}
    </div>
  );
}
