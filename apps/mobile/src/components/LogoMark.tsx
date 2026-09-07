import React from 'react';
import Svg, { Path } from 'react-native-svg';
import type { ColorScheme } from '../theme/colors';

interface LogoMarkProps {
  size?: number;
  scheme?: ColorScheme;
}

/**
 * Mirrors apps/web's LogoMark (`#/components/LogoMark`) — same paths, ported
 * to react-native-svg. Blue-700 is the brand blue and stays the brand blue in
 * light mode; dark mode lifts to blue-400 for the same reason as web: blue-700
 * on a near-black background sits too close to its own background to read.
 */
export function LogoMark({ size = 24, scheme = 'light' }: LogoMarkProps) {
  const color = scheme === 'dark' ? '#60a5fa' : '#1d4ed8';

  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path
        d="M11.5 13 L23.5 24 L11.5 35"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      />
      <Path
        d="M24.5 13 L36.5 24 L24.5 35"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
