import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useGenerateMockTalkingPoints } from '../hooks/useMockInterviewQuestionMutations';
import type { MockInterviewQuestion } from '../types';
import { BackgroundChooser, type MockBackground } from './BackgroundChooser';
import { AiGeneratedBadge } from './AiGeneratedBadge';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

interface TalkingPointsSectionProps {
  applicationId: string;
  roundId: string;
  question: MockInterviewQuestion;
}

/** The saved bullets of a question, one per line, without their leading dash. */
export function talkingPointBullets(talkingPoints: string | null): string[] {
  return (talkingPoints ?? '')
    .split('\n')
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter(Boolean);
}

/**
 * Talking points for one practice question (JEF-394): short bullets the user can
 * say, each citing the entry of their own experience it comes from. They are
 * saved on the question, labelled as AI generated.
 */
export function TalkingPointsSection({
  applicationId,
  roundId,
  question,
}: TalkingPointsSectionProps) {
  const { t, i18n } = useTranslation('interviews');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const generate = useGenerateMockTalkingPoints(applicationId, roundId);
  const [open, setOpen] = useState(false);
  // Talking points are meaningless without a source, so the profile starts on.
  const [background, setBackground] = useState<MockBackground>({
    useProfile: true,
    documentId: null,
  });
  const [nothingRelevant, setNothingRelevant] = useState(false);

  const bullets = talkingPointBullets(question.talkingPoints);
  const hasSource = background.useProfile || background.documentId !== null;

  const openDialog = () => {
    generate.reset();
    setNothingRelevant(false);
    setBackground({ useProfile: true, documentId: null });
    setOpen(true);
  };

  const run = () =>
    generate.mutate(
      {
        questionId: question.id,
        useProfile: background.useProfile,
        documentId: background.documentId,
      },
      {
        onSuccess: (result) => {
          setNothingRelevant(result.nothingRelevant);
          if (!result.nothingRelevant) setOpen(false);
        },
      },
    );

  return (
    <View style={styles.section}>
      {bullets.length > 0 ? (
        <View style={styles.bullets} testID={`talking-points-${question.id}`}>
          <View style={styles.bulletsHeader}>
            <Text style={styles.heading}>{t('talkingPoints')}</Text>
            <AiGeneratedBadge testID={`talking-points-badge-${question.id}`} />
          </View>
          {question.talkingPointsGeneratedAt ? (
            <Text style={styles.generatedOn}>
              {t('talkingPointsGeneratedOn', {
                date: new Date(question.talkingPointsGeneratedAt).toLocaleDateString(i18n.language),
              })}
            </Text>
          ) : null}
          {bullets.map((bullet) => (
            <Text key={bullet} style={styles.bullet}>
              • {bullet}
            </Text>
          ))}
        </View>
      ) : null}

      <Pressable
        style={styles.button}
        onPress={openDialog}
        accessibilityRole="button"
        testID={`talking-points-button-${question.id}`}
      >
        <Text style={styles.buttonText}>
          {bullets.length > 0 ? t('regenerateTalkingPoints') : t('talkingPoints')}
        </Text>
      </Pressable>

      {open ? (
        <Modal
          visible
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setOpen(false)}
          testID="talking-points-modal"
        >
          <KeyboardAvoidingView
            style={styles.modal}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.modalHeader}>
              <Pressable onPress={() => setOpen(false)} testID="talking-points-cancel-button">
                <Text style={styles.linkMuted}>{t('cancel')}</Text>
              </Pressable>
              <Text style={styles.modalTitle}>{t('talkingPoints')}</Text>
              <View style={styles.headerSpacer} />
            </View>
            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.questionText}>{question.question}</Text>
              <BackgroundChooser
                applicationId={applicationId}
                value={background}
                onChange={setBackground}
              />
              {nothingRelevant ? (
                <Text style={styles.note} testID="talking-points-nothing-relevant">
                  {t('talkingPointsNothingRelevant')}
                </Text>
              ) : null}
              {generate.isError ? (
                <Text style={styles.error}>{getErrorMessage(generate.error)}</Text>
              ) : null}
              <Pressable
                style={[
                  styles.generateButton,
                  (generate.isPending || !hasSource) && styles.disabled,
                ]}
                onPress={run}
                disabled={generate.isPending || !hasSource}
                accessibilityRole="button"
                testID="talking-points-submit-button"
              >
                {generate.isPending ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={styles.generateButtonText}>{t('generateTalkingPoints')}</Text>
                )}
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    section: { gap: 8 },
    bullets: {
      gap: 4,
      padding: 10,
      borderRadius: 8,
      backgroundColor: colors.primarySurface,
    },
    bulletsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    heading: { fontSize: 13, fontWeight: '700', color: colors.text },
    generatedOn: { fontSize: 12, color: colors.textSubtle },
    bullet: { fontSize: 14, lineHeight: 20, color: colors.text },
    button: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    buttonText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
    modal: { flex: 1, backgroundColor: colors.background },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerSpacer: { width: 48 },
    modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
    linkMuted: { color: colors.textSubtle, fontSize: 15, fontWeight: '600' },
    modalBody: { padding: 16, gap: 12 },
    questionText: { fontSize: 15, fontWeight: '600', color: colors.text },
    note: { fontSize: 13, color: colors.warning },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 13,
    },
    generateButton: {
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      backgroundColor: colors.primary,
    },
    generateButtonText: { color: colors.onPrimary, fontSize: 15, fontWeight: '700' },
    disabled: { opacity: 0.5 },
  });
}
