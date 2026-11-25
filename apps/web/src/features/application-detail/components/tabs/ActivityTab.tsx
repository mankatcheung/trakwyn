import { useQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  Dot,
  Paperclip,
  Pencil,
  RefreshCw,
  StickyNote,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { Card, EmptyState, Skeleton } from '@trakwyn/ui';
import { ACTIVITY_LOGS_QUERY } from '../../graphql/applicationDetailQueries';

type ActivityLog = {
  id: string;
  eventType: string;
  payload: string;
  createdAt: string;
};

interface EventKind {
  icon: LucideIcon;
  /** Key in the language bundles. */
  labelKey: string;
}

/** The event types the API writes (`ActivityEventType`), each with a line icon and a label key. */
const EVENT_KINDS: Record<string, EventKind> = {
  status_changed: { icon: RefreshCw, labelKey: 'applicationDetail.activity.statusChanged' },
  note_added: { icon: StickyNote, labelKey: 'applicationDetail.activity.noteAdded' },
  note_deleted: { icon: Trash2, labelKey: 'applicationDetail.activity.noteDeleted' },
  document_uploaded: { icon: Paperclip, labelKey: 'applicationDetail.activity.documentUploaded' },
  document_deleted: { icon: Trash2, labelKey: 'applicationDetail.activity.documentDeleted' },
  interview_added: { icon: CalendarClock, labelKey: 'applicationDetail.activity.interviewAdded' },
  field_updated: { icon: Pencil, labelKey: 'applicationDetail.activity.fieldUpdated' },
};

/** A type this build predates reads "Updated", never its raw code. */
const UNKNOWN_KIND: EventKind = { icon: Dot, labelKey: 'applicationDetail.activity.updated' };

function formatActivityPayload(eventType: string, payloadStr: string): string {
  try {
    const p = JSON.parse(payloadStr);
    if (eventType === 'status_changed') return `${p.from} → ${p.to}`;
    if (eventType === 'field_updated' && Array.isArray(p.fields)) return p.fields.join(', ');
  } catch {
    // ignore parse errors
  }
  return '';
}

/** "via Claude Desktop (MCP)" for a change an MCP client made (JEF-466); null for the user's own. */
function formatActor(payloadStr: string): string | null {
  try {
    const p = JSON.parse(payloadStr);
    if (p?.source !== 'mcp') return null;
    const name =
      typeof p.apiTokenName === 'string' && p.apiTokenName ? p.apiTokenName : 'an API token';
    return `via ${name} (MCP)`;
  } catch {
    return null;
  }
}

export function ActivityTab({ applicationId }: { applicationId: string }) {
  const { t } = useLocale();
  const { data, isLoading } = useQuery({
    queryKey: ['activityLogs', applicationId],
    queryFn: async () =>
      (await gqlClient.request(ACTIVITY_LOGS_QUERY, { applicationId })) as {
        activityLogs: ActivityLog[];
      },
  });

  const logs = data?.activityLogs ?? [];

  return (
    <div className="space-y-3">
      {isLoading ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : logs.length === 0 ? (
        <EmptyState size="compact" className="py-4" message="No activity yet." />
      ) : null}
      {logs.map((log) => {
        const detail = formatActivityPayload(log.eventType, log.payload);
        const actor = formatActor(log.payload);
        const { icon: Icon, labelKey } = EVENT_KINDS[log.eventType] ?? UNKNOWN_KIND;
        return (
          <Card key={log.id} className="flex items-start gap-3 p-3">
            <Icon
              className="mt-0.5 size-4 shrink-0 text-stone-400 dark:text-stone-500"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                {t(labelKey)}
                {detail && <span className="ml-1 font-normal text-stone-500">— {detail}</span>}
              </p>
              <p className="mt-0.5 text-xs text-stone-400">
                {new Date(log.createdAt).toLocaleString()}
                {actor && <span className="ml-2">· {actor}</span>}
              </p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
