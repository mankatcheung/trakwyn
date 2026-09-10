declare module 'react-native-markdown-display' {
  import type { ComponentType, ReactNode } from 'react';
  import type { TextStyle, ViewStyle } from 'react-native';

  export interface MarkdownProps {
    children: ReactNode;
    style?: Record<string, TextStyle | ViewStyle>;
  }

  const Markdown: ComponentType<MarkdownProps>;
  export default Markdown;
}
