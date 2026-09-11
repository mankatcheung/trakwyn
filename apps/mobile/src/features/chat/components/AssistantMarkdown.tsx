import React, { useMemo } from 'react';
import Markdown from 'react-native-markdown-display';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

interface AssistantMarkdownProps {
  content: string;
}

/**
 * Renders assistant chat messages as parsed markdown (JEF-314) rather than
 * raw text — headings/lists/code/etc. Only used for assistant-authored
 * content; user messages stay as plain text since they aren't markdown the
 * app generated.
 */
export function AssistantMarkdown({ content }: AssistantMarkdownProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createMarkdownStyles(colors), [colors]);
  return <Markdown style={styles}>{content}</Markdown>;
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
