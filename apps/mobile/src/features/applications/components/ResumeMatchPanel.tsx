import React, { useMemo } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useComputeResumeMatchScore } from '../hooks/useResumeMatchMutations';
import { findResumeMatch, useResumeMatches } from '../hooks/useResumeMatchQueries';
import type { ResumeRef } from '../types';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

interface ResumeMatchPanelProps {
  applicationId: string;
  resume: ResumeRef;
  /** Distinguishes panels on one screen; used for test ids. */
  resumeId: string;
}

/**
 * The match for one resume: a Generate button until there is a result, then
 * the saved result with a Regenerate button. The result is stored server-side,
 * so it is still here after a restart; `isStale` says the resume's text has
 * changed since it was scored.
 */
export function ResumeMatchPanel({ applicationId, resume, resumeId }: ResumeMatchPanelProps) {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: matches } = useResumeMatches(applicationId);
  const compute = useComputeResumeMatchScore(applicationId);
  const match = findResumeMatch(matches, resume);

  const onCompute = () => {
    compute.mutate(resume, {
      onError: (err) => Alert.alert(t('resumeMatch.couldNotCheckTitle'), getErrorMessage(err)),
    });
  };

  const button = (
    <Pressable
      style={[styles.button, compute.isPending && styles.buttonDisabled]}
      onPress={onCompute}
      disabled={compute.isPending}
      testID={`generate-resume-match-${resumeId}`}
    >
      {compute.isPending ? (
        <ActivityIndicator size="small" color={colors.onPrimary} />
      ) : (
        <Text style={styles.buttonText}>
          {match ? t('resumeMatch.regenerate') : t('resumeMatch.generate')}
        </Text>
      )}
    </Pressable>
  );

  if (!match) {
    return (
      <View style={styles.container} testID={`resume-match-${resumeId}`}>
        <Text style={styles.hint}>{t('resumeMatch.notGenerated')}</Text>
        {button}
      </View>
    );
  }

  return (
    <View style={styles.container} testID={`resume-match-${resumeId}`}>
      <View style={styles.scoreRow}>
        <Text style={styles.scoreValue}>{match.score}</Text>
        <View style={styles.scoreText}>
          <Text style={styles.scoreLabel}>{match.label}</Text>
          <Text style={styles.generatedAt}>
            {t('resumeMatch.generatedAt', {
              date: new Date(match.generatedAt).toLocaleString(),
            })}
          </Text>
        </View>
      </View>

      {match.isStale ? (
        <View
          style={styles.stale}
          accessibilityRole="alert"
          testID={`resume-match-stale-${resumeId}`}
        >
          <Text style={styles.staleText}>{t('resumeMatch.staleReminder')}</Text>
        </View>
      ) : null}

      {match.summary ? <Text style={styles.summary}>{match.summary}</Text> : null}

      {match.matchedKeywords.length > 0 ? (
        <View>
          <Text style={styles.keywordsHeading}>{t('resumeMatch.matchedKeywords')}</Text>
          <View style={styles.keywordsRow}>
            {match.matchedKeywords.map((kw) => (
              <View key={kw} style={styles.matchedChip}>
                <Text style={styles.matchedChipText}>{kw}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {match.missingKeywords.length > 0 ? (
        <View>
          <Text style={styles.keywordsHeading}>{t('resumeMatch.missingKeywords')}</Text>
          <View style={styles.keywordsRow}>
            {match.missingKeywords.map((kw) => (
              <View key={kw} style={styles.missingChip}>
                <Text style={styles.missingChipText}>{kw}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {button}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      gap: 10,
      marginTop: 8,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    hint: { fontSize: 13, color: colors.textSubtle },
    button: {
      alignSelf: 'flex-start',
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 8,
      minWidth: 100,
      alignItems: 'center',
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: colors.onPrimary, fontSize: 13, fontWeight: '700' },
    scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    scoreValue: { fontSize: 28, fontWeight: '800', color: colors.text },
    scoreText: { flex: 1, gap: 2 },
    scoreLabel: { fontSize: 14, fontWeight: '600', color: colors.textSubtle },
    generatedAt: { fontSize: 12, color: colors.textFaint },
    stale: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.warningBorder,
      backgroundColor: colors.warningSurface,
      padding: 10,
    },
    staleText: { fontSize: 13, color: colors.warning },
    summary: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
    keywordsHeading: { fontSize: 12, fontWeight: '600', color: colors.textFaint, marginBottom: 6 },
    keywordsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    matchedChip: {
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: colors.successSurface,
    },
    matchedChipText: { fontSize: 12, color: colors.success, fontWeight: '600' },
    missingChip: {
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: colors.dangerSurface,
    },
    missingChipText: { fontSize: 12, color: colors.danger, fontWeight: '600' },
  });
}
