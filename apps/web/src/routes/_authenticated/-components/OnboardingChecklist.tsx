import { Link } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2Icon, CircleIcon, XIcon } from 'lucide-react';
import { Button, Card } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import {
  DISMISS_ONBOARDING_CHECKLIST,
  onboardingChecklistQueryOptions,
  type OnboardingChecklistData,
} from '../dashboard';

interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  to: string;
}

interface OnboardingChecklistProps {
  data: OnboardingChecklistData;
  hasApplications: boolean;
}

export function OnboardingChecklist({ data, hasApplications }: OnboardingChecklistProps) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const dismissMutation = useMutation({
    mutationFn: () => gqlClient.request(DISMISS_ONBOARDING_CHECKLIST),
    onSuccess: () => qc.invalidateQueries({ queryKey: onboardingChecklistQueryOptions.queryKey }),
  });

  const items: ChecklistItem[] = [
    {
      key: 'application',
      label: t('onboardingChecklist.createApplication'),
      done: hasApplications,
      to: '/applications/new',
    },
    {
      key: 'mcp',
      label: t('onboardingChecklist.connectMcp'),
      done: (data.apiTokens ?? []).length > 0,
      to: '/settings/integrations',
    },
    {
      key: 'aiKey',
      label: t('onboardingChecklist.addAiKey'),
      done: (data.llmApiKeys ?? []).length > 0,
      to: '/settings/ai',
    },
    {
      key: 'experience',
      label: t('onboardingChecklist.addExperience'),
      done: (data.workExperiences ?? []).length > 0,
      to: '/settings/experience',
    },
  ];

  const dismissed = data.me?.onboardingChecklistDismissedAt != null;
  const allDone = items.every((item) => item.done);
  if (dismissed || allDone) return null;

  return (
    <Card className="mb-10 p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('onboardingChecklist.title')}
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            {t('onboardingChecklist.description')}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => dismissMutation.mutate()}
          aria-label={t('onboardingChecklist.dismiss')}
        >
          <XIcon size={16} />
        </Button>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              to={item.to}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              {item.done ? (
                <CheckCircle2Icon size={16} className="shrink-0 text-green-600" />
              ) : (
                <CircleIcon size={16} className="shrink-0 text-gray-400" />
              )}
              <span
                className={
                  item.done
                    ? 'text-gray-500 line-through dark:text-gray-400'
                    : 'text-gray-900 dark:text-gray-100'
                }
              >
                {item.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
