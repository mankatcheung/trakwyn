import React, { useMemo } from 'react';
import { Linking, Text } from 'react-native';
import MarkdownDisplay, { type ASTNode, type RenderRule } from 'react-native-markdown-display';
import { isSafeMarkdownUrl, linkHostToShow } from '../lib/safeMarkdownUrl';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';

interface MarkdownProps {
  content: string;
}

/**
 * Renders app-generated markdown (assistant chat messages, JEF-314, and the
 * company briefing, JEF-391) as parsed markdown rather than raw text. Only
 * use it for content the app's own model produced; user-typed text stays
 * plain since it isn't markdown the app generated. Text an attacker controls
 * can reach the model, so images never load and only https, http and mailto
 * links open (JEF-464).
 */
export function Markdown({ content }: MarkdownProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createMarkdownStyles(colors), [colors]);
  const rules = useMemo(() => createSafeRules(colors), [colors]);
  return (
    <MarkdownDisplay style={styles} rules={rules} onLinkPress={isSafeMarkdownUrl}>
      {content}
    </MarkdownDisplay>
  );
}

function textOf(node: ASTNode): string {
  return node.type === 'text' ? node.content : node.children.map(textOf).join('');
}

function createSafeRules(colors: ThemeColors): Record<string, RenderRule> {
  const muted = { color: colors.textSubtle };
  const link = { color: colors.primary };
  return {
    // Never a remote image: it would load unasked, and a prompt-injected reply
    // can put the user's data in its URL. Only the alt text shows.
    image: (node) => {
      const alt = node.attributes.alt;
      return alt ? (
        <Text key={node.key} style={muted}>
          [{alt}]
        </Text>
      ) : null;
    },
    // Names the host when the label doesn't, so misleading link text can't
    // hide where it goes; an unsafe URL doesn't open at all.
    link: (node, children) => {
      const href = node.attributes.href ?? '';
      const host = linkHostToShow(href, textOf(node));
      return (
        <Text key={node.key}>
          <Text
            style={link}
            onPress={() => {
              if (isSafeMarkdownUrl(href)) void Linking.openURL(href);
            }}
          >
            {children}
          </Text>
          {host && <Text style={muted}> ({host})</Text>}
        </Text>
      );
    },
  };
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
