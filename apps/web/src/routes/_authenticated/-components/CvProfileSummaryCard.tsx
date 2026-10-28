import { Link } from '@tanstack/react-router';
import { IdCardIcon, PencilIcon } from 'lucide-react';
import { Card, Skeleton } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import { CompletenessMeter } from '../profile/-components/CompletenessMeter';
import { profileCompleteness } from '../profile/-components/profileCompleteness';
import type { WorkExperience } from '../profile/-components/profileQueries';
import { useProfileData } from '../profile/-components/useProfileData';

// Dates are ISO strings, so they order correctly as text; a role still held
// sorts as if it ends after every real end date.
const STILL_HELD_END_DATE = '9999-12-31';

/** A role still held beats any that ended; otherwise the one that ended most recently. */
export function latestRole(workExperiences: readonly WorkExperience[]): WorkExperience | null {
  const endKey = (we: WorkExperience) => we.endDate ?? STILL_HELD_END_DATE;
  return (
    [...workExperiences].sort(
      (a, b) => endKey(b).localeCompare(endKey(a)) || b.startDate.localeCompare(a.startDate),
    )[0] ?? null
  );
}

export function CvProfileSummaryCard() {
  const { t } = useLocale();
  const profile = useProfileData();

  // The card is a shortcut, not the page: if the profile can't load, the
  // dashboard carries on without it rather than showing a second error.
  if (profile.isError) return null;

  const { workExperiences, educations, skills } = profile;
  const isEmpty = workExperiences.length + educations.length + skills.length === 0;
  const role = latestRole(workExperiences);

  return (
    <Card className="mb-10 p-5" data-testid="cv-profile-card">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
          <IdCardIcon size={18} /> {t('dashboard.cvProfileTitle')}
        </h2>
        {!profile.isLoading && !isEmpty && (
          <Link
            to="/profile"
            className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            <PencilIcon size={14} /> {t('dashboard.cvProfileEdit')}
          </Link>
        )}
      </div>

      {profile.isLoading ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : isEmpty ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t('dashboard.cvProfileEmpty')}
          </p>
          <Link
            to="/profile"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            {t('dashboard.cvProfileFillIn')}
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            {role && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('dashboard.cvProfileLatestRole')}
                </p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {t('experience.titleAtCompany', { title: role.title, company: role.company })}
                </p>
              </div>
            )}
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
              <li>{t('dashboard.cvProfileRoles', { count: workExperiences.length })}</li>
              <li>{t('dashboard.cvProfileEducation', { count: educations.length })}</li>
              <li>{t('dashboard.cvProfileSkills', { count: skills.length })}</li>
            </ul>
          </div>
          <CompletenessMeter completeness={profileCompleteness(profile)} />
        </div>
      )}
    </Card>
  );
}
