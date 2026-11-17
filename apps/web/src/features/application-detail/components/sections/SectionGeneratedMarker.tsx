import { CheckIcon } from 'lucide-react';
import { useLocale } from '#/lib/i18n';

interface SectionGeneratedMarkerProps {
  generated: boolean;
  size?: number;
}

/**
 * Whether a section's one generated item exists: a check when it does, a
 * muted dot when not. The label is the accessible name, so the state is not
 * carried by the icon alone.
 */
export function SectionGeneratedMarker({ generated, size = 14 }: SectionGeneratedMarkerProps) {
  const { t } = useLocale();
  const label = t(
    generated ? 'applicationDetail.briefingGenerated' : 'applicationDetail.briefingNotGenerated',
  );

  return generated ? (
    <CheckIcon
      role="img"
      aria-label={label}
      size={size}
      className="text-green-600 dark:text-green-400"
    />
  ) : (
    <span
      role="img"
      aria-label={label}
      className="inline-block size-1.5 rounded-full bg-gray-300 dark:bg-gray-600"
    />
  );
}
