import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  useAddGapMetric,
  useAddGapSkill,
  useDismissResumeGap,
  useResumeGaps,
} from '../hooks/useResumeGaps';
import { ROLE_DESCRIPTION_MAX_CHARS, appendToDescription, roleGapKey } from '../lib/resumeGaps';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import type { RoleWithoutMetrics } from '../types';
import { CollapsibleCard } from './CollapsibleCard';

interface ResumeGapsCardProps {
  applicationId: string;
}

type Actions = {
  busy: boolean;
  addSkill: (name: string) => void;
  dismiss: (key: string) => void;
  addMetric: (role: RoleWithoutMetrics, line: string) => void;
};

function RequirementRow({ requirement, actions }: { requirement: string; actions: Actions }) {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.row} testID={`resume-gap-requirement-${requirement}`}>
      <Text style={styles.question}>
        {t('resumeGaps.haveYouUsed')} <Text style={styles.strong}>{requirement}</Text>?
      </Text>
      <View style={styles.buttons}>
        <Pressable
          style={[styles.secondary, actions.busy && styles.disabled]}
          disabled={actions.busy}
          onPress={() => actions.addSkill(requirement)}
          accessibilityRole="button"
          accessibilityLabel={t('resumeGaps.addSkillLabel', { skill: requirement })}
          testID={`resume-gap-add-skill-${requirement}`}
        >
          <Text style={styles.secondaryText}>{t('resumeGaps.yesAddSkill')}</Text>
        </Pressable>
        <Pressable
          style={[styles.ghost, actions.busy && styles.disabled]}
          disabled={actions.busy}
          onPress={() => actions.dismiss(requirement)}
          accessibilityRole="button"
          accessibilityLabel={t('resumeGaps.dismissSkillLabel', { skill: requirement })}
          testID={`resume-gap-dismiss-${requirement}`}
        >
          <Text style={styles.ghostText}>{t('resumeGaps.no')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function RoleRow({ role, actions }: { role: RoleWithoutMetrics; actions: Actions }) {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [line, setLine] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const id = role.workExperienceId;

  const submit = () => {
    const text = line.trim();
    // Without a figure the role would come straight back as the same question.
    if (!/\d/.test(text)) return setProblem(t('resumeGaps.needsNumber'));
    if (appendToDescription(role.description, text).length > ROLE_DESCRIPTION_MAX_CHARS) {
      return setProblem(t('resumeGaps.descriptionFull'));
    }
    setProblem(null);
    actions.addMetric(role, text);
  };

  return (
    <View style={styles.row} testID={`resume-gap-role-${id}`}>
      <Text style={styles.question}>
        {t('resumeGaps.roleHasNoNumbers', { title: role.title, company: role.company })}
      </Text>
      <TextInput
        style={styles.input}
        value={line}
        onChangeText={setLine}
        placeholder={t('resumeGaps.metricPlaceholder')}
        placeholderTextColor={colors.textFaint}
        testID={`resume-gap-metric-input-${id}`}
      />
      {problem ? (
        <Text style={styles.problem} testID={`resume-gap-metric-problem-${id}`}>
          {problem}
        </Text>
      ) : null}
      <View style={styles.buttons}>
        <Pressable
          style={[styles.secondary, (actions.busy || !line.trim()) && styles.disabled]}
          disabled={actions.busy || !line.trim()}
          onPress={submit}
          accessibilityRole="button"
          testID={`resume-gap-add-metric-${id}`}
        >
          <Text style={styles.secondaryText}>{t('resumeGaps.addToProfile')}</Text>
        </Pressable>
        <Pressable
          style={[styles.ghost, actions.busy && styles.disabled]}
          disabled={actions.busy}
          onPress={() => actions.dismiss(roleGapKey(id))}
          accessibilityRole="button"
          accessibilityLabel={t('resumeGaps.skipRoleLabel', {
            title: role.title,
            company: role.company,
          })}
          testID={`resume-gap-skip-role-${id}`}
        >
          <Text style={styles.ghostText}>{t('resumeGaps.skip')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * "Strengthen this resume" (JEF-594): what the posting asks for that the
 * profile does not show, and which roles have no numbers. The AI may not
 * invent either, so the questions go to the user: a "yes" is saved to the
 * profile and a "no" is remembered, on web too. Nothing here calls AI.
 */
export function ResumeGapsCard({ applicationId }: ResumeGapsCardProps) {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [added, setAdded] = useState(false);
  const { data: gaps } = useResumeGaps(applicationId);
  const addSkill = useAddGapSkill(applicationId);
  const addMetric = useAddGapMetric(applicationId);
  const dismiss = useDismissResumeGap(applicationId);

  if (!gaps) return null;
  const count = gaps.requirementGaps.length + gaps.rolesWithoutMetrics.length;
  // Nothing to ask, nothing just answered and nothing to explain: stay out of the way.
  if (count === 0 && !added && gaps.requirementsRead) return null;

  const busy = addSkill.isPending || addMetric.isPending || dismiss.isPending;
  const actions: Actions = {
    busy,
    addSkill: (name) => addSkill.mutate(name, { onSuccess: () => setAdded(true) }),
    addMetric: (role, line) =>
      addMetric.mutate({ role, line }, { onSuccess: () => setAdded(true) }),
    dismiss: (key) => dismiss.mutate(key),
  };
  const failure = addSkill.error ?? addMetric.error ?? dismiss.error;

  return (
    <CollapsibleCard
      title={t('resumeGaps.title')}
      badge={count > 0 ? String(count) : null}
      testID="resume-gaps-card"
    >
      <Text style={styles.muted}>{t('resumeGaps.intro')}</Text>

      {!gaps.requirementsRead ? <Text style={styles.muted}>{t('resumeGaps.notRead')}</Text> : null}

      {gaps.requirementGaps.length > 0 ? (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>{t('resumeGaps.requirementsHeading')}</Text>
          {gaps.requirementGaps.map((requirement) => (
            <RequirementRow key={requirement} requirement={requirement} actions={actions} />
          ))}
        </View>
      ) : null}

      {gaps.rolesWithoutMetrics.length > 0 ? (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>{t('resumeGaps.metricsHeading')}</Text>
          {gaps.rolesWithoutMetrics.map((role) => (
            <RoleRow key={role.workExperienceId} role={role} actions={actions} />
          ))}
        </View>
      ) : null}

      {added ? (
        <Text style={styles.saved} accessibilityRole="alert" testID="resume-gaps-saved">
          {t('resumeGaps.saved')}
        </Text>
      ) : null}
      {failure ? (
        <Text style={styles.error} accessibilityRole="alert" testID="resume-gaps-error">
          {getErrorMessage(failure)}
        </Text>
      ) : null}
    </CollapsibleCard>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    group: { gap: 8 },
    groupTitle: { fontSize: 12, fontWeight: '600', color: colors.textSubtle },
    muted: { fontSize: 13, color: colors.textFaint, lineHeight: 18 },
    row: {
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 10,
    },
    question: { fontSize: 14, color: colors.text, lineHeight: 20 },
    strong: { fontWeight: '700' },
    buttons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    secondary: {
      minHeight: 36,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
    ghost: {
      minHeight: 36,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ghostText: { color: colors.textSubtle, fontSize: 13, fontWeight: '600' },
    disabled: { opacity: 0.5 },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    problem: { fontSize: 12, color: colors.danger },
    saved: { fontSize: 13, color: colors.success },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 13,
    },
  });
}
