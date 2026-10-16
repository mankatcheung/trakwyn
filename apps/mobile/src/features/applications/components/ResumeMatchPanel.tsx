import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useComputeResumeMatchScore } from '../hooks/useResumeMatchMutations';
import { findResumeMatch, useResumeMatches } from '../hooks/useResumeMatchQueries';
import type { ResumeRef } from '../types';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { ChevronDownIcon, ChevronUpIcon } from './ApplicationIcons';

interface ResumeMatchPanelProps {
  applicationId: string;
  resume: ResumeRef;
  /** Distinguishes panels on one screen; used for test ids. */
  resumeId: string;
}

/** The bar's tone: the same bands as web's score colours, collapsed to three. */
function scoreTone(score: number, colors: ThemeColors) {
  if (score >= 71) return { background: colors.successSurface, text: colors.success };
  if (score >= 41) return { background: colors.warningSurface, text: colors.warning };
  return { background: colors.dangerSurface, text: colors.danger };
}

/**
 * The match for one resume: a full-width "Generate match" bar until there is
 * a result, then a score bar that expands in place to the summary and keywords
 * (JEF-399). The result is stored server-side, so it is still here after a
 * restart; `isStale` says the resume's text has changed since it was scored.
 */
export function ResumeMatchPanel({ applicationId, resume, resumeId }: ResumeMatchPanelProps) {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: matches } = useResumeMatches(applicationId);
  const compute = useComputeResumeMatchScore(applicationId);
  const match = findResumeMatch(matches, resume);
  const [expanded, setExpanded] = useState(false);

  const onCompute = () => {
    compute.mutate(resume, {
      // A fresh result opens itself: the bar alone would hide what was just asked for.
      onSuccess: () => setExpanded(true),
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
        <Pressable
          style={[styles.bar, styles.generateBar, compute.isPending && styles.buttonDisabled]}
          onPress={onCompute}
          disabled={compute.isPending}
          accessibilityRole="button"
          testID={`generate-resume-match-${resumeId}`}
        >
          {compute.isPending ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={styles.generateBarText}>{t('resumeMatch.generate')}</Text>
          )}
        </Pressable>
      </View>
    );
  }

  const tone = scoreTone(match.score, colors);
  return (
    <View style={styles.container} testID={`resume-match-${resumeId}`}>
      <Pressable
        style={[styles.bar, { backgroundColor: tone.background }]}
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        testID={`resume-match-toggle-${resumeId}`}
      >
        <Text style={[styles.barScore, { color: tone.text }]}>
          {match.score} · {match.label}
          {match.isStale ? ` · ${t('resumeMatch.staleBadge')}` : ''}
        </Text>
        {expanded ? (
          <ChevronUpIcon color={tone.text} size={16} />
        ) : (
          <ChevronDownIcon color={tone.text} size={16} />
        )}
      </Pressable>

      {expanded ? (
        <View style={styles.details}>
          <Text style={styles.generatedAt}>
            {t('resumeMatch.generatedAt', {
              date: new Date(match.generatedAt).toLocaleString(),
            })}
          </Text>

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
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { gap: 10, marginTop: 8 },
    bar: {
      minHeight: 44,
      borderRadius: 10,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    generateBar: {
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
    },
    generateBarText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
    barScore: { fontSize: 14, fontWeight: '700' },
    details: { gap: 10 },
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
