import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

// Below this count, a rate is more noise than signal — flagged rather than
// hidden, mirroring apps/web's small-sample threshold across every
// analytics panel that computes a rate over a per-application count.
export const SMALL_SAMPLE_THRESHOLD = 3;

interface RatioBarProps {
  label: string;
  meta?: string;
  percent: number | null;
  percentLabel?: string;
  color?: string;
  sampleSize?: number;
  testID?: string;
}

export function RatioBar({
  label,
  meta,
  percent,
  percentLabel,
  color,
  sampleSize,
  testID,
}: RatioBarProps) {
  const { t } = useTranslation('analytics');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const resolvedColor = color ?? colors.primary;
  const smallSample = sampleSize != null && sampleSize < SMALL_SAMPLE_THRESHOLD;
  return (
    <View style={styles.row} testID={testID}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: `${Math.min(100, Math.max(0, percent ?? 0))}%`,
              backgroundColor: resolvedColor,
            },
          ]}
        />
      </View>
      <Text style={styles.percent}>{percentLabel ?? (percent != null ? `${percent}%` : '—')}</Text>
      {smallSample ? <Text style={styles.smallSample}>{t('smallSample')}</Text> : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
    label: { width: 84, fontSize: 12, color: colors.text },
    meta: { width: 56, fontSize: 11, color: colors.textSubtle },
    track: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden',
    },
    fill: { height: '100%', borderRadius: 3 },
    percent: {
      width: 40,
      textAlign: 'right',
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
    },
    smallSample: { fontSize: 9, color: colors.textFaint },
  });
}
