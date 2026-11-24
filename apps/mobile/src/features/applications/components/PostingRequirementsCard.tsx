import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AiCreditCost } from '../../ai/components/AiCreditCost';
import { useAiCredits } from '../../ai/hooks/useAiCredits';
import { AiCreditsExhaustedNotice } from '../../settings/components/AiCreditsExhaustedNotice';

import {
  useExtractPostingRequirements,
  usePostingRequirements,
} from '../hooks/usePostingRequirements';
import { ERROR_CODES } from '../../../constants';
import { getErrorCode, getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import type { PostingRequirements } from '../types';
import { CollapsibleCard } from './CollapsibleCard';

interface PostingRequirementsCardProps {
  applicationId: string;
}

function RequirementList({ title, items }: { title: string; items: string[] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (items.length === 0) return null;
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      {items.map((item) => (
        <Text key={item} style={styles.item}>
          {`• ${item}`}
        </Text>
      ))}
    </View>
  );
}

function Requirements({ requirements }: { requirements: PostingRequirements }) {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { mustHave, niceToHave, keywords } = requirements;
  const isEmpty = mustHave.length + niceToHave.length + keywords.length === 0;

  return (
    <View style={styles.group}>
      {requirements.isStale ? (
        <Text style={styles.stale} accessibilityRole="alert" testID="posting-requirements-stale">
          {t('postingRequirements.stale')}
        </Text>
      ) : null}
      {isEmpty ? (
        <Text style={styles.muted}>{t('postingRequirements.none')}</Text>
      ) : (
        <>
          <RequirementList title={t('postingRequirements.mustHave')} items={mustHave} />
          <RequirementList title={t('postingRequirements.niceToHave')} items={niceToHave} />
          {keywords.length > 0 ? (
            <View style={styles.group}>
              <Text style={styles.groupTitle}>{t('postingRequirements.keywords')}</Text>
              <View style={styles.chips}>
                {keywords.map((keyword) => (
                  <View key={keyword} style={styles.chip}>
                    <Text style={styles.chipText}>{keyword}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}
      <Text style={styles.muted}>
        {t('postingRequirements.readOn', {
          date: new Date(requirements.generatedAt).toLocaleDateString(),
        })}
      </Text>
    </View>
  );
}

/**
 * What the posting asks for (JEF-593): must-haves, nice-to-haves and keywords,
 * read from the posting once with AI. Opening the card never calls AI; the
 * button does, and only when there is nothing saved or the posting has changed.
 */
export function PostingRequirementsCard({ applicationId }: PostingRequirementsCardProps) {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: requirements, isPending } = usePostingRequirements(applicationId);
  const extract = useExtractPostingRequirements(applicationId);
  const { onTrakwynAi, canAfford } = useAiCredits();

  // Nothing until the saved list is known, so the "read it" offer never flashes over one.
  if (isPending) return null;

  const canRead = !requirements || requirements.isStale;
  const exhausted =
    (onTrakwynAi && !canAfford('postingRequirements')) ||
    getErrorCode(extract.error) === ERROR_CODES.AI_CREDITS_EXHAUSTED;

  return (
    <CollapsibleCard
      title={t('postingRequirements.title')}
      badge={requirements?.seniority}
      testID="posting-requirements-card"
    >
      {!requirements ? <Text style={styles.muted}>{t('postingRequirements.notRead')}</Text> : null}
      {requirements ? <Requirements requirements={requirements} /> : null}

      {canRead ? (
        <View style={styles.actions}>
          <Pressable
            style={[styles.button, (extract.isPending || exhausted) && styles.buttonDisabled]}
            onPress={() => extract.mutate()}
            disabled={extract.isPending || exhausted}
            accessibilityRole="button"
            testID="extract-posting-requirements-button"
          >
            {extract.isPending ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <Text style={styles.buttonText}>
                {requirements ? t('postingRequirements.readAgain') : t('postingRequirements.read')}
              </Text>
            )}
          </Pressable>
          <AiCreditCost feature="postingRequirements" />
        </View>
      ) : null}

      {exhausted ? (
        <AiCreditsExhaustedNotice
          surface="ai_action"
          message={extract.error ? getErrorMessage(extract.error) : undefined}
        />
      ) : extract.isError ? (
        <Text style={styles.error} accessibilityRole="alert" testID="posting-requirements-error">
          {getErrorMessage(extract.error)}
        </Text>
      ) : null}
    </CollapsibleCard>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    group: { gap: 6 },
    groupTitle: { fontSize: 12, fontWeight: '500', color: colors.textSubtle },
    item: { fontSize: 14, color: colors.text, lineHeight: 20 },
    muted: { fontSize: 13, color: colors.textFaint },
    stale: { fontSize: 12, color: colors.warning },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    chipText: { fontSize: 12, color: colors.text },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    button: {
      minHeight: 40,
      paddingHorizontal: 14,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: colors.onPrimary, fontSize: 14, fontWeight: '500' },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 13,
    },
  });
}
