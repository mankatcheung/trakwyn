declare module 'react-native-markdown-display' {
  import type { ComponentType, ReactNode } from 'react';
  import type { TextStyle, ViewStyle } from 'react-native';

  export interface ASTNode {
    type: string;
    key: string;
    content: string;
    attributes: Record<string, string | undefined>;
    children: ASTNode[];
  }

  export type RenderRule = (
    node: ASTNode,
    children: ReactNode[],
    parent: ASTNode[],
    styles: Record<string, TextStyle | ViewStyle>,
    onLinkPress?: (url: string) => boolean,
  ) => ReactNode;

  export interface MarkdownProps {
    children: ReactNode;
    style?: Record<string, TextStyle | ViewStyle>;
    rules?: Record<string, RenderRule>;
    /** Called before a link opens; the library opens it only on `true`. */
    onLinkPress?: (url: string) => boolean;
  }

  const Markdown: ComponentType<MarkdownProps>;
  export default Markdown;
}
