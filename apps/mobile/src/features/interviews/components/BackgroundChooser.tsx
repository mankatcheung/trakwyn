import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useDocuments } from '../../documents/hooks/useDocumentQueries';
import { documentCategory } from '../../documents/lib/documentCategory';
import { rememberUseProfile } from '../lib/mockBackgroundChoice';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

export interface MockBackground {
  useProfile: boolean;
  documentId: string | null;
}

interface BackgroundChooserProps {
  applicationId: string;
  value: MockBackground;
  onChange: (next: MockBackground) => void;
}

/**
 * Chooses what the AI may know about the candidate (JEF-394): their profile,
 * one uploaded resume, both or neither. It says plainly that this goes to their
 * AI provider, since the profile is personal data.
 */
export function BackgroundChooser({ applicationId, value, onChange }: BackgroundChooserProps) {
  const { t } = useTranslation('interviews');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: documents } = useDocuments(applicationId);
  const resumes = (documents ?? []).filter((d) => documentCategory(d.documentType) === 'resume');

  return (
    <View style={styles.box} testID="background-chooser">
      <Text style={styles.legend}>{t('backgroundLegend')}</Text>
      <View style={styles.row}>
        <Text style={styles.rowText}>{t('useMyProfile')}</Text>
        <Switch
          value={value.useProfile}
          onValueChange={(useProfile) => {
            rememberUseProfile(useProfile);
            onChange({ ...value, useProfile });
          }}
          accessibilityLabel={t('useMyProfile')}
          testID="background-profile-switch"
        />
      </View>
      {resumes.length > 0 ? (
        <View style={styles.resumes}>
          <Text style={styles.label}>{t('useResume')}</Text>
          {[{ id: null, name: t('noResume') }, ...resumes].map((resume) => {
            const isOn = value.documentId === resume.id;
            return (
              <Pressable
                key={resume.id ?? 'none'}
                style={[styles.option, isOn && styles.optionOn]}
                onPress={() => onChange({ ...value, documentId: resume.id })}
                accessibilityRole="radio"
                accessibilityState={{ selected: isOn }}
                testID={`background-resume-${resume.id ?? 'none'}`}
              >
                <Text style={styles.optionText}>{resume.name}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <Text style={styles.privacy}>{t('backgroundPrivacy')}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    box: {
      gap: 8,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    legend: { fontSize: 13, fontWeight: '700', color: colors.text },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      minHeight: 44,
    },
    rowText: { flex: 1, fontSize: 14, color: colors.text },
    resumes: { gap: 6 },
    label: { fontSize: 12, fontWeight: '600', color: colors.textSubtle },
    option: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    optionOn: { borderColor: colors.primary, backgroundColor: colors.primarySurface },
    optionText: { fontSize: 14, color: colors.text },
    privacy: { fontSize: 12, color: colors.textSubtle, lineHeight: 17 },
  });
}
