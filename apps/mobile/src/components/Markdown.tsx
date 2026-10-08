import React, { useMemo } from 'react';
import MarkdownDisplay from 'react-native-markdown-display';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';

interface MarkdownProps {
  content: string;
}

/**
 * Renders app-generated markdown (assistant chat messages, JEF-314, and the
 * company briefing, JEF-391) as parsed markdown rather than raw text. Only
 * use it for content the app's own model produced; user-typed text stays
 * plain since it isn't markdown the app generated.
 */
export function Markdown({ content }: MarkdownProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createMarkdownStyles(colors), [colors]);
  return <MarkdownDisplay style={styles}>{content}</MarkdownDisplay>;
}

function createMarkdownStyles(colors: ThemeColors) {
  return {
    body: { color: colors.text, fontSize: 15, lineHeight: 20 },
    paragraph: { marginTop: 0, marginBottom: 8 },
    heading1: { color: colors.text, fontSize: 18, fontWeight: '600' as const, marginBottom: 8 },
    heading2: { color: colors.text, fontSize: 17, fontWeight: '600' as const, marginBottom: 8 },
    heading3: { color: colors.text, fontSize: 16, fontWeight: '600' as const, marginBottom: 8 },
    strong: { fontWeight: '700' as const },
    em: { fontStyle: 'italic' as const },
    link: { color: colors.primary },
    bullet_list: { marginBottom: 8 },
    ordered_list: { marginBottom: 8 },
    code_inline: {
      backgroundColor: colors.surfaceAlt,
      color: colors.text,
      fontFamily: 'monospace',
      fontSize: 13,
      lineHeight: 20,
      paddingHorizontal: 4,
      borderRadius: 4,
    },
    code_block: {
      backgroundColor: colors.surfaceAlt,
      color: colors.text,
      fontFamily: 'monospace',
      fontSize: 13,
      lineHeight: 18,
      borderRadius: 8,
      padding: 10,
    },
    fence: {
      backgroundColor: colors.surfaceAlt,
      color: colors.text,
      fontFamily: 'monospace',
      fontSize: 13,
      lineHeight: 18,
      borderRadius: 8,
      padding: 10,
    },
    blockquote: {
      backgroundColor: 'transparent',
      borderLeftColor: colors.border,
      borderLeftWidth: 3,
      paddingLeft: 10,
    },
  };
}
