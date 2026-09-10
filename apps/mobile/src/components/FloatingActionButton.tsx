import React, { useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { PlusIcon } from '../features/applications/components/ApplicationIcons';

interface FloatingActionButtonProps {
  onPress: () => void;
  testID?: string;
  accessibilityLabel?: string;
}

export function FloatingActionButton({
  onPress,
  testID,
  accessibilityLabel,
}: FloatingActionButtonProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      style={styles.fab}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <PlusIcon color={colors.onPrimary} size={24} />
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 28,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 4,
    },
  });
}
