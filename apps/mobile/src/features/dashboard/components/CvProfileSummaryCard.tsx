import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useEducations, useSkills, useWorkExperiences } from '../../settings/hooks/useExperience';
import { latestRole, profileCompleteness } from '../../profile/lib/profileCompleteness';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

/** Where the card leads: the profile editor, inside the Home stack. */
const PROFILE_ROUTE = './profile';

/**
 * A shortcut to the CV profile (work experience, education, skills), the
 * mobile counterpart of web's dashboard card (JEF-459). It is not the editor:
 * if the profile can't load, the dashboard carries on without it rather than
 * showing a second error.
 */
export function CvProfileSummaryCard() {
  const { t } = useTranslation('dashboard');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const work = useWorkExperiences();
  const education = useEducations();
  const skills = useSkills();

  if (work.isError || education.isError || skills.isError) return null;

  const isLoading = work.isLoading || education.isLoading || skills.isLoading;
  const workExperiences = work.data ?? [];
  const educations = education.data ?? [];
  const skillList = skills.data ?? [];
  const isEmpty = workExperiences.length + educations.length + skillList.length === 0;
  const role = latestRole(workExperiences);
  const { percent } = profileCompleteness({
    workExperiences,
    educations,
    skills: skillList,
  });
  const completenessLabel = t('cvProfile.completeness', { percent });

  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push(PROFILE_ROUTE)}
      accessibilityRole="button"
      testID="dashboard-cv-profile-card"
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('cvProfile.title')}</Text>
        {!isLoading && !isEmpty ? <Text style={styles.link}>{t('cvProfile.edit')}</Text> : null}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} testID="dashboard-cv-profile-loading" />
      ) : isEmpty ? (
        <View style={styles.emptyGroup}>
          <Text style={styles.body}>{t('cvProfile.empty')}</Text>
          <View style={styles.fillInButton} testID="dashboard-cv-profile-fill-in">
            <Text style={styles.fillInText}>{t('cvProfile.fillIn')}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.summaryGroup}>
          {role ? (
            <View style={styles.roleGroup}>
              <Text style={styles.caption}>{t('cvProfile.latestRole')}</Text>
              <Text style={styles.roleText}>
                {t('cvProfile.titleAtCompany', { title: role.title, company: role.company })}
              </Text>
            </View>
          ) : null}
          <View style={styles.countsRow}>
            <Text style={styles.body}>
              {t('cvProfile.roles', { count: workExperiences.length })}
            </Text>
            <Text style={styles.body}>
              {t('cvProfile.education', { count: educations.length })}
            </Text>
            <Text style={styles.body}>{t('cvProfile.skills', { count: skillList.length })}</Text>
          </View>
          <View style={styles.completenessGroup}>
            <Text style={styles.completenessLabel}>{completenessLabel}</Text>
            <View
              style={styles.progressTrack}
              accessibilityRole="progressbar"
              accessibilityLabel={completenessLabel}
              accessibilityValue={{ min: 0, max: 100, now: percent }}
            >
              <View style={[styles.progressFill, { width: `${percent}%` }]} />
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 16,
      gap: 12,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontSize: 16, fontWeight: '700', color: colors.text },
    link: { fontSize: 14, fontWeight: '600', color: colors.primary },
    body: { fontSize: 13, color: colors.textMuted },
    emptyGroup: { gap: 12 },
    fillInButton: {
      alignSelf: 'flex-start',
      borderRadius: 10,
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    fillInText: { fontSize: 14, fontWeight: '600', color: colors.onPrimary },
    summaryGroup: { gap: 12 },
    roleGroup: { gap: 2 },
    caption: { fontSize: 12, color: colors.textSubtle },
    roleText: { fontSize: 15, fontWeight: '600', color: colors.text },
    countsRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4 },
    completenessGroup: { gap: 6 },
    completenessLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
    progressTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primarySurface,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  });
}
