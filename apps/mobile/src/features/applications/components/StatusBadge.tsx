import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ApplicationStatus } from '../types';
import { statusColors } from '../lib/statusColors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import i18n from '../../../i18n';

export function statusLabel(status: ApplicationStatus): string {
  return i18n.t(`applications:status.${status}`);
}

interface Props {
  status: ApplicationStatus;
}

export function StatusBadge({ status }: Props) {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const statusColor = statusColors(colors)[status];
  return (
    <View style={[styles.badge, { backgroundColor: statusColor.bg }]}>
      <Text style={[styles.text, { color: statusColor.fg }]}>{t(`status.${status}`)}</Text>
    </View>
  );
}

function createStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    badge: {
      alignSelf: 'flex-start',
      borderRadius: 9999,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    text: { fontSize: 13, fontWeight: '700' },
  });
}
