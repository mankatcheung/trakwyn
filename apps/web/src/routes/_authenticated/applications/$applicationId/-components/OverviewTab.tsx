import { Card } from '@trakwyn/ui';
import type { Application } from '../-application-query';
import { ApplicationJobInfo } from './ApplicationJobInfo';
import type { HealthScore } from './HealthScorePanel';

/** The job information on wide screens, where the header card keeps only the title and actions (JEF-403). */
export function OverviewTab({ app, healthScore }: { app: Application; healthScore?: HealthScore }) {
  return (
    <Card className="p-4 sm:p-6">
      <div className="[&>*:first-child]:mt-0">
        <ApplicationJobInfo app={app} healthScore={healthScore} collapseDescription={false} />
      </div>
    </Card>
  );
}
