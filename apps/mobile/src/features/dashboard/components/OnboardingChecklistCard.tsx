import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useDismissOnboardingChecklist } from '../hooks/useDashboardQueries';
import { CheckCircleIcon, ChevronDownIcon, CloseIcon, OutlineCircleIcon } from './DashboardIcons';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import type { OnboardingChecklistData } from '../types';

interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  to: string;
}

interface Props {
  data: OnboardingChecklistData;
  hasApplications: boolean;
}

export function OnboardingChecklistCard({ data, hasApplications }: Props) {
  const { t } = useTranslation('dashboard');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);
  const dismissMutation = useDismissOnboardingChecklist();

  const items: ChecklistItem[] = [
    {
      key: 'application',
      label: t('onboardingChecklist.createApplication'),
      done: hasApplications,
      to: './applications/new',
    },
    {
      key: 'mcp',
      label: t('onboardingChecklist.connectMcp'),
      done: (data.apiTokens ?? []).length > 0,
      to: '/(tabs)/settings/integrations',
    },
    {
      key: 'aiKey',
      label: t('onboardingChecklist.addAiKey'),
      done: (data.llmApiKeys ?? []).length > 0,
      to: '/(tabs)/settings/ai',
    },
    {
      key: 'experience',
      label: t('onboardingChecklist.addExperience'),
      done: (data.workExperiences ?? []).length > 0,
      to: '/(tabs)/settings/experience',
    },
  ];

  const dismissed = data.me?.onboardingChecklistDismissedAt != null;
  const allDone = items.every((item) => item.done);
  if (dismissed || allDone) return null;

  return (
    <View style={styles.card} testID="onboarding-checklist">
      <Pressable
        style={styles.headerRow}
        onPress={() => setExpanded((prev) => !prev)}
        testID="onboarding-checklist-toggle"
      >
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('onboardingChecklist.title')}</Text>
          {expanded ? (
            <Text style={styles.description}>{t('onboardingChecklist.description')}</Text>
          ) : null}
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => dismissMutation.mutate()}
            accessibilityLabel={t('onboardingChecklist.dismiss')}
            hitSlop={8}
          >
            <CloseIcon color={colors.textMuted} />
          </Pressable>
          <View style={expanded ? styles.chevronExpanded : undefined}>
            <ChevronDownIcon color={colors.textMuted} />
          </View>
        </View>
      </Pressable>
      {expanded ? (
        <View style={styles.items}>
          {items.map((item) => (
            <Pressable
              key={item.key}
              style={styles.item}
              onPress={() => router.push(item.to)}
              testID={`onboarding-checklist-item-${item.key}`}
            >
              {item.done ? (
                <CheckCircleIcon color={colors.success} />
              ) : (
                <OutlineCircleIcon color={colors.textSubtle} />
              )}
              <Text style={[styles.itemLabel, item.done && styles.itemLabelDone]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
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
    headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    headerText: { flex: 1, gap: 2, paddingRight: 12 },
    title: { fontSize: 16, fontWeight: '700', color: colors.text },
    description: { fontSize: 13, color: colors.textMuted },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    chevronExpanded: { transform: [{ rotate: '180deg' }] },
    items: { gap: 8 },
    item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
    itemLabel: { flex: 1, fontSize: 14, color: colors.text },
    itemLabelDone: { color: colors.textSubtle, textDecorationLine: 'line-through' },
  });
}
