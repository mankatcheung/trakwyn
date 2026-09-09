import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { APPLICATION_STATUSES, type ApplicationStatus } from '../types';
import { statusLabel } from './StatusBadge';
import { CheckIcon, ChevronDownIcon, FilterIcon } from './ApplicationIcons';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

type StatusFilterValue = 'all' | ApplicationStatus;

interface Props {
  value: StatusFilterValue;
  onChange: (value: StatusFilterValue) => void;
}

export function StatusFilterButton({ value, onChange }: Props) {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);

  const currentLabel = value === 'all' ? t('list.all') : statusLabel(value);

  function select(next: StatusFilterValue) {
    onChange(next);
    setOpen(false);
  }

  return (
    <>
      <Pressable
        style={[styles.button, value !== 'all' && styles.buttonActive]}
        onPress={() => setOpen(true)}
        accessibilityLabel={t('list.statusFilterAria')}
        testID="applications-status-filter-button"
      >
        <FilterIcon color={value !== 'all' ? colors.primary : colors.textSubtle} />
        <Text style={[styles.buttonText, value !== 'all' && styles.buttonTextActive]}>
          {t('list.statusFilterLabel', { status: currentLabel })}
        </Text>
        <ChevronDownIcon color={value !== 'all' ? colors.primary : colors.textSubtle} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.grabber} />
            <Text style={styles.title}>{t('list.statusFilterTitle')}</Text>
            <StatusOption
              label={t('list.all')}
              selected={value === 'all'}
              onPress={() => select('all')}
              testID="status-filter-option-all"
            />
            {APPLICATION_STATUSES.map((status) => (
              <StatusOption
                key={status}
                label={statusLabel(status)}
                selected={value === status}
                onPress={() => select(status)}
                testID={`status-filter-option-${status}`}
              />
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function StatusOption({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable style={styles.row} onPress={onPress} testID={testID}>
      <Text style={[styles.rowText, selected && styles.rowTextSelected]}>{label}</Text>
      {selected ? <CheckIcon color={colors.primary} /> : null}
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 40,
      paddingHorizontal: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignSelf: 'flex-start',
    },
    buttonActive: { borderColor: colors.primary },
    buttonText: { fontSize: 14, color: colors.textSubtle, fontWeight: '600' },
    buttonTextActive: { color: colors.primary },
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
      justifyContent: 'space-between',
      minHeight: 48,
    },
    rowText: { fontSize: 15, color: colors.text },
    rowTextSelected: { color: colors.primary, fontWeight: '600' },
  });
}
