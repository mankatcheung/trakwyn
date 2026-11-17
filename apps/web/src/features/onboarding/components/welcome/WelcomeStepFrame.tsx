import { useEffect, useRef, type ReactNode } from 'react';
import { Button, Card, ProgressBar } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';

interface WelcomeStepFrameProps {
  /** 1-based position, for the progress line. */
  stepNumber: number;
  totalSteps: number;
  title: string;
  description?: string;
  children?: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  /** Disables the actions while the answer is being saved. */
  busy?: boolean;
  onBack?: () => void;
  /** "Skip this step": moves on without whatever this step asks for. */
  onSkipStep?: () => void;
  /** "Skip setup": ends the whole flow. Hidden on the last step, where finishing is the same thing. */
  onSkipSetup?: () => void;
}

/** One step of the welcome flow: progress, heading, body, and its way forward, back and out. */
export function WelcomeStepFrame({
  stepNumber,
  totalSteps,
  title,
  description,
  children,
  primaryLabel,
  onPrimary,
  busy = false,
  onBack,
  onSkipStep,
  onSkipSetup,
}: WelcomeStepFrameProps) {
  const { t } = useLocale();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Each step replaces the last in place, so move focus to its heading:
  // otherwise a keyboard or screen-reader user is left on a button that no
  // longer exists.
  useEffect(() => {
    headingRef.current?.focus();
  }, [stepNumber]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-8 sm:py-10">
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
          {t('welcome.stepProgress', { current: stepNumber, total: totalSteps })}
        </p>
        {onSkipSetup && (
          <Button variant="ghost" size="sm" onClick={onSkipSetup} disabled={busy}>
            {t('welcome.skipSetup')}
          </Button>
        )}
      </div>
      <ProgressBar value={stepNumber} max={totalSteps} className="mb-6" aria-hidden="true" />

      <Card className="p-5 sm:p-8">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-bold text-gray-900 outline-none dark:text-gray-100"
        >
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{description}</p>
        )}
        {children && <div className="mt-6">{children}</div>}

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {onBack && (
              <Button variant="ghost" onClick={onBack} disabled={busy}>
                {t('welcome.back')}
              </Button>
            )}
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
            {onSkipStep && (
              <Button variant="secondary" onClick={onSkipStep} disabled={busy}>
                {t('welcome.skipStep')}
              </Button>
            )}
            <Button onClick={onPrimary} disabled={busy}>
              {primaryLabel}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
