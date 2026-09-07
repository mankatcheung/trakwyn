import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

interface TrashIconProps {
  color: string;
  size?: number;
}

export function TrashIcon({ color, size = 18 }: TrashIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7h16M9 7V4h6v3" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Rect x={6} y={7} width={12} height={13} rx={1} stroke={color} strokeWidth={2} />
      <Path d="M10 11v6M14 11v6" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
