import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ApplicationHealthScore } from '../types';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

function healthScoreTone(colors: ThemeColors, score: number): string {
  if (score >= 71) return colors.primary;
  if (score >= 41) return '#a16207';
  return colors.danger;
}

interface Props {
  healthScore: ApplicationHealthScore;
}

/**
 * The health-score card, expandable on tap to show the criteria breakdown
 * (label, met/unmet, points earned) — mirroring web's `HealthScorePanel`
 * (JEF-303). No new GraphQL: `criteria` was already returned by
 * `applicationHealthScore` and simply wasn't rendered on mobile.
 */
export function HealthScoreCard({ healthScore }: Props) {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);
  const tone = healthScoreTone(colors, healthScore.score);

  return (
    <Pressable
      style={styles.card}
      onPress={() => setExpanded((value) => !value)}
      testID="health-score-card"
    >
      <View style={styles.headerRow}>
        <Text style={styles.cardLabel}>{t('detail.healthScoreLabel')}</Text>
        <View style={styles.headerRight}>
          <Text style={[styles.healthScoreValue, { color: tone }]}>{healthScore.score} / 100</Text>
          <Text style={styles.chevron} testID="health-score-chevron">
            {expanded ? '▾' : '▸'}
          </Text>
        </View>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.max(0, Math.min(100, healthScore.score))}%`, backgroundColor: tone },
          ]}
        />
      </View>

      {expanded ? (
        <View style={styles.criteriaList} testID="health-score-criteria">
          {healthScore.criteria.map((criterion) => (
            <View key={criterion.key} style={styles.criterionRow}>
              <View style={styles.criterionLeft}>
                <View
                  style={[
                    styles.criterionDot,
                    criterion.met ? { backgroundColor: colors.primary } : styles.criterionDotUnmet,
                  ]}
                />
                <Text style={[styles.criterionLabel, !criterion.met && styles.criterionLabelUnmet]}>
                  {criterion.label}
                </Text>
              </View>
              <Text style={[styles.criterionPoints, !criterion.met && styles.criterionPointsUnmet]}>
                +{criterion.points}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 12,
    },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
    healthScoreValue: { fontSize: 16, fontWeight: '700' },
    chevron: { fontSize: 13, color: colors.textFaint },
    progressTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 4 },
    criteriaList: { gap: 8, paddingTop: 4 },
    criterionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    criterionLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
    criterionDot: { width: 8, height: 8, borderRadius: 4 },
    criterionDotUnmet: { backgroundColor: '#d1d5db' },
    criterionLabel: { fontSize: 13, color: colors.textMuted, flexShrink: 1 },
    criterionLabelUnmet: { color: colors.textFaint },
    criterionPoints: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
    criterionPointsUnmet: { color: colors.textFaint },
  });
}
