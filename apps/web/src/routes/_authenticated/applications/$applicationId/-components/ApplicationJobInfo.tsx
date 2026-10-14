import { useLocale } from '#/lib/i18n';
import type { Application } from '../-application-query';
import { ApplicationInfoChips } from './ApplicationInfoChips';
import { CollapsibleDescription } from './CollapsibleDescription';
import { HealthScorePanel, type HealthScore } from './HealthScorePanel';

interface ApplicationJobInfoProps {
  app: Application;
  healthScore?: HealthScore;
  /** Clamp the description to a few lines (the phone card) or show all of it (the Overview tab). */
  collapseDescription: boolean;
}

/**
 * What the application says about the job: chips, reminder note, posting link,
 * description and health score. One body, two homes (JEF-403) — the header
 * card below `lg` and the Overview tab from `lg` — so the two cannot drift.
 */
export function ApplicationJobInfo({
  app,
  healthScore,
  collapseDescription,
}: ApplicationJobInfoProps) {
  const { t } = useLocale();

  return (
    <>
      <div className="mt-3">
        <ApplicationInfoChips app={app} />
      </div>

      {app.followUpAt && (
        <p className="mt-2 text-xs text-gray-400">{t('applicationDetail.emailReminderNote')}</p>
      )}

      {app.jobUrl && (
        <div className="mt-3">
          <dt className="text-xs text-gray-400">{t('applicationForm.jobUrlLabel')}</dt>
          <a
            href={app.jobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs break-all text-blue-600 hover:underline"
          >
            {app.jobUrl}
          </a>
        </div>
      )}

      {app.description && (
        <div className="mt-3">
          <dt className="mb-1 text-xs text-gray-400">{t('applicationDetail.descriptionLabel')}</dt>
          {collapseDescription ? (
            <CollapsibleDescription text={app.description} />
          ) : (
            <p className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">
              {app.description}
            </p>
          )}
        </div>
      )}

      {healthScore && <HealthScorePanel healthScore={healthScore} />}
    </>
  );
}
