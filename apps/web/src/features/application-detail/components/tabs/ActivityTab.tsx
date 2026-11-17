import { useQuery } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { Card, EmptyState, Skeleton } from '@trakwyn/ui';
const ACTIVITY_LOGS_QUERY = `
  query ActivityLogs($applicationId: ID!) {
    activityLogs(applicationId: $applicationId) {
      id eventType payload createdAt
    }
  }
`;

type ActivityLog = {
  id: string;
  eventType: string;
  payload: string;
  createdAt: string;
};

const EVENT_LABELS: Record<string, string> = {
  status_changed: 'Status changed',
  note_added: 'Note added',
  note_deleted: 'Note deleted',
  document_uploaded: 'Document uploaded',
  document_deleted: 'Document deleted',
  interview_added: 'Interview round added',
  field_updated: 'Fields updated',
};

const EVENT_ICONS: Record<string, string> = {
  status_changed: '🔄',
  note_added: '📝',
  note_deleted: '🗑️',
  document_uploaded: '📎',
  document_deleted: '🗑️',
  interview_added: '🎙️',
  field_updated: '✏️',
};

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
  const { data, isLoading } = useQuery({
    queryKey: ['activityLogs', applicationId],
    queryFn: () =>
      gqlClient.request<{ activityLogs: ActivityLog[] }>(ACTIVITY_LOGS_QUERY, { applicationId }),
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
        return (
          <Card key={log.id} className="flex items-start gap-3 p-3">
            <span className="mt-0.5 text-lg leading-none">{EVENT_ICONS[log.eventType] ?? '•'}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {EVENT_LABELS[log.eventType] ?? log.eventType}
                {detail && <span className="ml-1 font-normal text-gray-500">— {detail}</span>}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">
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
