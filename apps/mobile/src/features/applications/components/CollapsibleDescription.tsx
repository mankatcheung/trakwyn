import React, { useMemo, useState } from 'react';
import {
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  TextLayoutEventData,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

const PREVIEW_LINES = 5;

interface Props {
  text: string;
}

export function CollapsibleDescription({ text }: Props) {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);

  const onMeasuredLayout = (event: NativeSyntheticEvent<TextLayoutEventData>) => {
    setIsTruncated(event.nativeEvent.lines.length > PREVIEW_LINES);
  };

  return (
    <>
      <Text
        style={[styles.fieldValue, styles.measure]}
        onTextLayout={onMeasuredLayout}
        pointerEvents="none"
        testID="description-measure"
      >
        {text}
      </Text>
      <Text style={styles.fieldValue} numberOfLines={expanded ? undefined : PREVIEW_LINES}>
        {text}
      </Text>
      {isTruncated ? (
        <Pressable onPress={() => setExpanded((prev) => !prev)}>
          <Text style={styles.toggle}>
            {expanded ? t('detail.showLess') : t('detail.showMore')}
          </Text>
        </Pressable>
      ) : null}
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    fieldValue: { fontSize: 15, color: colors.text, lineHeight: 21 },
    measure: { position: 'absolute', opacity: 0 },
    toggle: { fontSize: 14, color: colors.primary, fontWeight: '600', marginTop: 4 },
  });
}
