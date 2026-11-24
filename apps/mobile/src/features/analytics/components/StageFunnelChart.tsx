import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { statusLabel } from '../../applications/components/StatusBadge';
import type { FunnelPoint } from '../lib/analyticsSummary';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { fixedColors } from '../../../theme/colors';

function statusColors(colors: ThemeColors): Record<string, string> {
  return {
    draft: colors.textFaint,
    applied: colors.primary,
    interviewing: fixedColors.interview,
    offered: fixedColors.offered,
    accepted: fixedColors.accepted,
    rejected: colors.danger,
    withdrawn: colors.textSubtle,
  };
}

export function StageFunnelChart({ data }: { data: FunnelPoint[] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const statusColorMap = useMemo(() => statusColors(colors), [colors]);
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <View style={styles.chart} testID="stage-funnel-chart">
      {data.map((point) => (
        <View key={point.status} style={styles.row}>
          <Text style={styles.label} numberOfLines={1}>
            {statusLabel(point.status)}
          </Text>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                {
                  width: `${(point.count / max) * 100}%`,
                  backgroundColor: statusColorMap[point.status] ?? colors.primary,
                },
              ]}
            />
          </View>
          <Text style={styles.count}>{point.count}</Text>
        </View>
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    chart: { gap: 6 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    label: { width: 84, fontSize: 12, color: colors.textMuted },
    track: {
      flex: 1,
      height: 14,
      borderRadius: 4,
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden',
    },
    fill: { height: '100%', borderRadius: 4 },
    count: {
      width: 24,
      textAlign: 'right',
      fontSize: 12,
      fontWeight: '500',
      color: colors.textMuted,
    },
  });
}
