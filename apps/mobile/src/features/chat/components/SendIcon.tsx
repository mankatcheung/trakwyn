import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface SendIconProps {
  color: string;
  size?: number;
}

export function SendIcon({ color, size = 18 }: SendIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 12l16-8-6 8 6 8-16-8z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}
