import React, { useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface IconButtonProps {
  icon: React.ComponentType<{ color: string; size?: number }>;
  onPress: () => void;
  variant?: 'default' | 'danger';
  size?: number;
  iconSize?: number;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel: string;
}

export function IconButton({
  icon: Icon,
  onPress,
  variant = 'default',
  size = 40,
  iconSize = 18,
  disabled,
  testID,
  accessibilityLabel,
}: IconButtonProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(size), [size]);
  const color = variant === 'danger' ? colors.danger : colors.textSubtle;

  return (
    <Pressable
      style={styles.button}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
    >
      <Icon color={color} size={iconSize} />
    </Pressable>
  );
}

function createStyles(size: number) {
  return StyleSheet.create({
    button: {
      width: size,
      height: size,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
