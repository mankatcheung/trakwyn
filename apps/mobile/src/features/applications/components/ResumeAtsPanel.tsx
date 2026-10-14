import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useComputeResumeAtsScore } from '../hooks/useResumeAtsMutations';
import { findResumeAtsScore, useResumeAtsScores } from '../hooks/useResumeAtsQueries';
import type { AtsCheck, AtsScore, ResumeRef } from '../types';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { ChevronDownIcon, ChevronUpIcon } from './ApplicationIcons';

interface ResumeAtsPanelProps {
  applicationId: string;
  resume: ResumeRef;
  /** Distinguishes panels on one screen; used for test ids. */
  resumeId: string;
}

/** The bar's tone: the same bands as the match score's, and red when nothing could be read. */
function scoreTone(ats: AtsScore, colors: ThemeColors) {
  if (!ats.readable || ats.score < 41) {
    return { background: colors.dangerSurface, text: colors.danger };
  }
  if (ats.score < 71) return { background: colors.warningSurface, text: colors.warning };
  return { background: colors.successSurface, text: colors.success };
}

/**
 * The ATS-readiness check for one resume (JEF-395): a "Check ATS" bar until
 * there is a result, then a score bar that expands in place to the checklist,
 * failed checks first with how to fix each. The result is saved server-side, so
 * it is still here after a restart; `isStale` says the resume's text has changed
 * since it was scored. Separate from the job match, which needs a job
 * description and an AI key.
 */
export function ResumeAtsPanel({ applicationId, resume, resumeId }: ResumeAtsPanelProps) {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: scores } = useResumeAtsScores(applicationId);
  const compute = useComputeResumeAtsScore(applicationId);
  const ats = findResumeAtsScore(scores, resume);
  const [expanded, setExpanded] = useState(false);

  const onCompute = () => {
    compute.mutate(resume, {
      // A fresh result opens itself: the bar alone would hide what was just asked for.
      onSuccess: () => setExpanded(true),
      onError: (err) => Alert.alert(t('resumeAts.couldNotCheckTitle'), getErrorMessage(err)),
    });
  };

  if (!ats) {
    return (
      <View style={styles.container} testID={`resume-ats-${resumeId}`}>
        <Pressable
          style={[styles.bar, styles.checkBar, compute.isPending && styles.disabled]}
          onPress={onCompute}
          disabled={compute.isPending}
          accessibilityRole="button"
          testID={`check-resume-ats-${resumeId}`}
        >
          {compute.isPending ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={styles.checkBarText}>{t('resumeAts.check')}</Text>
          )}
        </Pressable>
      </View>
    );
  }

  const tone = scoreTone(ats, colors);
  const failed = ats.checks.filter((c) => !c.passed);
  const passed = ats.checks.filter((c) => c.passed);
  const Chevron = expanded ? ChevronUpIcon : ChevronDownIcon;

  return (
    <View style={styles.container} testID={`resume-ats-${resumeId}`}>
      <Pressable
        style={[styles.bar, { backgroundColor: tone.background }]}
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        testID={`resume-ats-toggle-${resumeId}`}
      >
        <Text style={[styles.barScore, { color: tone.text }]}>
          {ats.readable
            ? t('resumeAts.bar', { score: ats.score, label: ats.label })
            : t('resumeAts.notReadableBar')}
          {ats.isStale ? ` · ${t('resumeAts.staleBadge')}` : ''}
        </Text>
        <Chevron color={tone.text} size={16} />
      </Pressable>

      {expanded ? (
        <View style={styles.details}>
          <Text style={styles.description}>
            {ats.readable ? t('resumeAts.description') : t('resumeAts.notReadable')}
          </Text>
          <Text style={styles.checkedAt}>
            {t('resumeAts.checkedAt', { date: new Date(ats.generatedAt).toLocaleString() })}
          </Text>
          {ats.isStale ? (
            <View
              style={styles.stale}
              accessibilityRole="alert"
              testID={`resume-ats-stale-${resumeId}`}
            >
              <Text style={styles.staleText}>{t('resumeAts.staleReminder')}</Text>
            </View>
          ) : null}
          <CheckGroup
            title={t('resumeAts.fixFirst', { count: failed.length })}
            checks={failed}
            resumeId={resumeId}
          />
          <CheckGroup
            title={t('resumeAts.passing', { count: passed.length })}
            checks={passed}
            resumeId={resumeId}
          />
          <Pressable
            style={[styles.button, compute.isPending && styles.disabled]}
            onPress={onCompute}
            disabled={compute.isPending}
            accessibilityRole="button"
            testID={`recheck-resume-ats-${resumeId}`}
          >
            {compute.isPending ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <Text style={styles.buttonText}>{t('resumeAts.recheck')}</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function CheckGroup({
  title,
  checks,
  resumeId,
}: {
  title: string;
  checks: AtsCheck[];
  resumeId: string;
}) {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (checks.length === 0) return null;
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      {checks.map((check) => (
        <View
          key={check.id}
          style={[styles.check, !check.passed && styles.checkFailed]}
          testID={`ats-check-${resumeId}-${check.id}`}
        >
          <View style={styles.checkHeader}>
            <Text
              style={styles.checkMark}
              accessibilityLabel={check.passed ? t('resumeAts.passed') : t('resumeAts.failed')}
            >
              {check.passed ? '✓' : '✕'}
            </Text>
            <Text style={styles.checkLabel}>{check.label}</Text>
            {check.maxPoints > 0 ? (
              <Text style={styles.checkPoints}>
                {t('resumeAts.points', { points: check.points, max: check.maxPoints })}
              </Text>
            ) : null}
          </View>
          {!check.passed ? <Text style={styles.hint}>{check.hint}</Text> : null}
        </View>
      ))}
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
    checkBar: {
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
    },
    checkBarText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
    barScore: { fontSize: 14, fontWeight: '700' },
    disabled: { opacity: 0.6 },
    details: { gap: 10 },
    description: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
    checkedAt: { fontSize: 12, color: colors.textFaint },
    stale: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.warningBorder,
      backgroundColor: colors.warningSurface,
      padding: 10,
    },
    staleText: { fontSize: 13, color: colors.warning },
    group: { gap: 6 },
    groupTitle: { fontSize: 12, fontWeight: '600', color: colors.textFaint },
    check: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, gap: 4 },
    checkFailed: { backgroundColor: colors.dangerSurface },
    checkHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    checkMark: { fontSize: 14, fontWeight: '700', color: colors.textMuted, width: 16 },
    checkLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
    checkPoints: { fontSize: 12, color: colors.textFaint },
    hint: { fontSize: 13, color: colors.textMuted, lineHeight: 19, marginLeft: 24 },
    button: {
      alignSelf: 'flex-start',
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 8,
      minWidth: 100,
      alignItems: 'center',
    },
    buttonText: { color: colors.onPrimary, fontSize: 13, fontWeight: '700' },
  });
}
