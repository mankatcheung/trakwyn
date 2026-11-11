import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface ThumbIconProps {
  direction: 'up' | 'down';
  color: string;
  /** Filled in when the thumb is the chosen one. */
  filled?: boolean;
  size?: number;
}

// The Lucide thumbs-up and thumbs-down outlines, the same icons the web app uses.
const UP =
  'M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z';
const DOWN =
  'M17 14V2M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z';

export function ThumbIcon({ direction, color, filled = false, size = 18 }: ThumbIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={direction === 'up' ? UP : DOWN}
        stroke={color}
        fill={filled ? color : 'none'}
        fillOpacity={filled ? 0.25 : 0}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}
