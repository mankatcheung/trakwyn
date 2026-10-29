import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Alert } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import {
  finishDestination,
  useCompleteOnboarding,
  welcomeSteps,
  type OnboardingGoal,
} from '#/lib/onboarding';
import { WelcomeStepFrame } from './WelcomeStepFrame';
import { GoalsStep } from './GoalsStep';
import { ProfileStep } from './ProfileStep';
import { AiKeyStep } from './AiKeyStep';

/**
 * The first-run welcome flow (JEF-460): welcome, goals, then for AI goals a
 * quick profile and an AI key, then finish. Every step can be skipped, and so
 * can the whole flow; finishing or skipping it saves the goals (none, when
 * skipped) and the guard stops sending the user here.
 */
export function WelcomePage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const complete = useCompleteOnboarding();
  const [goals, setGoals] = useState<OnboardingGoal[]>([]);
  const [index, setIndex] = useState(0);

  const steps = welcomeSteps(goals);
  const step = steps[Math.min(index, steps.length - 1)];
  const position = { stepNumber: steps.indexOf(step) + 1, totalSteps: steps.length };
  const busy = complete.isPending;

  const next = () => setIndex((i) => i + 1);
  const back = () => setIndex((i) => Math.max(0, i - 1));
  const finish = (saved: OnboardingGoal[]) =>
    complete.mutate(saved, {
      onSuccess: () => void navigate({ to: finishDestination(saved) }),
    });
  const skipSetup = () => finish([]);

  const error = complete.isError && <Alert className="mt-4">{t('welcome.saveFailed')}</Alert>;

  switch (step) {
    case 'intro':
      return (
        <WelcomeStepFrame
          {...position}
          title={t('welcome.introTitle')}
          description={t('welcome.introBody')}
          primaryLabel={t('welcome.introStart')}
          onPrimary={next}
          onSkipSetup={skipSetup}
          busy={busy}
        >
          {error}
        </WelcomeStepFrame>
      );
    case 'goals':
      return (
        <WelcomeStepFrame
          {...position}
          title={t('welcome.goalsTitle')}
          description={t('welcome.goalsDescription')}
          primaryLabel={t('welcome.continue')}
          onPrimary={next}
          onBack={back}
          onSkipStep={() => {
            setGoals([]);
            next();
          }}
          onSkipSetup={skipSetup}
          busy={busy}
        >
          <GoalsStep goals={goals} onChange={setGoals} />
          {error}
        </WelcomeStepFrame>
      );
    case 'profile':
      return (
        <WelcomeStepFrame
          {...position}
          title={t('welcome.profileTitle')}
          description={t('welcome.profileBody')}
          primaryLabel={t('welcome.continue')}
          onPrimary={next}
          onBack={back}
          onSkipStep={next}
          onSkipSetup={skipSetup}
          busy={busy}
        >
          <ProfileStep />
          {error}
        </WelcomeStepFrame>
      );
    case 'aiKey':
      return (
        <WelcomeStepFrame
          {...position}
          title={t('welcome.aiKeyTitle')}
          description={t('welcome.aiKeyBody')}
          primaryLabel={t('welcome.continue')}
          onPrimary={next}
          onBack={back}
          onSkipStep={next}
          onSkipSetup={skipSetup}
          busy={busy}
        >
          <AiKeyStep />
          {error}
        </WelcomeStepFrame>
      );
    case 'finish':
      return (
        <WelcomeStepFrame
          {...position}
          title={t('welcome.finishTitle')}
          description={t('welcome.finishBody')}
          primaryLabel={
            finishDestination(goals) === '/applications/new'
              ? t('welcome.finishToNewApplication')
              : t('welcome.finishToDashboard')
          }
          onPrimary={() => finish(goals)}
          onBack={back}
          busy={busy}
        >
          {error}
        </WelcomeStepFrame>
      );
  }
}
