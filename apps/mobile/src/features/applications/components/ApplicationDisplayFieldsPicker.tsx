import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  APPLICATION_DISPLAY_FIELDS,
  type ApplicationDisplayField,
  type ApplicationDisplayFields,
} from '../lib/applicationDisplayFields';
import { CheckIcon, SlidersIcon } from './ApplicationIcons';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

interface Props {
  fields: ApplicationDisplayFields;
  onToggle: (field: ApplicationDisplayField) => void;
}

const FIELD_LABEL_KEYS: Record<ApplicationDisplayField, string> = {
  role: 'list.displayFields.role',
  location: 'list.displayFields.location',
  date: 'list.displayFields.date',
  tags: 'list.displayFields.tags',
  status: 'list.displayFields.status',
  starred: 'list.displayFields.starred',
  ghosted: 'list.displayFields.ghosted',
};

/** JEF-230-mirroring control: an icon button opening a bottom sheet of
 * checkboxes deciding which detail fields the applications list rows show. */
export function ApplicationDisplayFieldsPicker({ fields, onToggle }: Props) {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        style={[styles.iconButton, open && styles.iconButtonActive]}
        onPress={() => setOpen(true)}
        accessibilityLabel={t('list.displayFields.pickerAria')}
        testID="applications-display-fields-button"
      >
        <SlidersIcon color={open ? colors.primary : colors.textSubtle} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.grabber} />
            <Text style={styles.title}>{t('list.displayFields.title')}</Text>
            {APPLICATION_DISPLAY_FIELDS.map((field) => {
              const checked = fields[field];
              return (
                <Pressable
                  key={field}
                  style={styles.row}
                  onPress={() => onToggle(field)}
                  testID={`display-field-${field}`}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                    {checked ? <CheckIcon color={colors.onPrimary} size={12} /> : null}
                  </View>
                  <Text style={styles.rowText}>{t(FIELD_LABEL_KEYS[field])}</Text>
                </Pressable>
              );
            })}
            <Text style={styles.footnote}>{t('list.displayFields.companyAlwaysShown')}</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    iconButtonActive: { borderColor: colors.primary },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingHorizontal: 20,
      paddingBottom: 24,
    },
    grabber: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginTop: 10,
      marginBottom: 14,
    },
    title: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: colors.textFaint,
      marginBottom: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 48,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 2,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
    rowText: { fontSize: 15, color: colors.text },
    footnote: { fontSize: 11, color: colors.textFaint, marginTop: 8 },
  });
}
