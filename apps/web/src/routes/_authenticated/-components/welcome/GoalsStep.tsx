import { Checkbox } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import { ONBOARDING_GOALS, type OnboardingGoal } from '#/lib/onboarding';

/** The i18n keys for each goal, listed literally so the parity test can see them. */
const GOAL_COPY: Record<OnboardingGoal, { title: string; description: string }> = {
  TRACK_APPLICATIONS: {
    title: 'welcome.goalTrackTitle',
    description: 'welcome.goalTrackDescription',
  },
  AI_DOCUMENTS: {
    title: 'welcome.goalDocumentsTitle',
    description: 'welcome.goalDocumentsDescription',
  },
  ASSISTANT: {
    title: 'welcome.goalAssistantTitle',
    description: 'welcome.goalAssistantDescription',
  },
  MCP: {
    title: 'welcome.goalMcpTitle',
    description: 'welcome.goalMcpDescription',
  },
};

interface GoalsStepProps {
  goals: readonly OnboardingGoal[];
  onChange: (goals: OnboardingGoal[]) => void;
}

/** "What do you want help with?" — any number of the four goals. */
export function GoalsStep({ goals, onChange }: GoalsStepProps) {
  const { t } = useLocale();

  const toggle = (goal: OnboardingGoal, checked: boolean) =>
    // Kept in display order, whatever order they were ticked in.
    onChange(ONBOARDING_GOALS.filter((g) => (g === goal ? checked : goals.includes(g))));

  return (
    <fieldset>
      <legend className="sr-only">{t('welcome.goalsTitle')}</legend>
      <ul className="grid gap-3 sm:grid-cols-2">
        {ONBOARDING_GOALS.map((goal) => {
          const selected = goals.includes(goal);
          const inputId = `welcome-goal-${goal}`;
          return (
            <li key={goal}>
              <label
                htmlFor={inputId}
                className={`flex h-full cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                  selected
                    ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20'
                    : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/40'
                }`}
              >
                <Checkbox
                  id={inputId}
                  className="mt-0.5 shrink-0"
                  checked={selected}
                  onChange={(e) => toggle(goal, e.target.checked)}
                />
                <span>
                  <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                    {t(GOAL_COPY[goal].title)}
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-600 dark:text-gray-400">
                    {t(GOAL_COPY[goal].description)}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
