import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

interface IconProps {
  color: string;
  size?: number;
}

export function SearchIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={2} />
      <Path d="M20 20l-4-4" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function RestoreIcon({ color, size = 16 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 9a8 8 0 1 1 1.5 6.5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M4 4v5h5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function DeleteForeverIcon({ color, size = 16 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7h16M9 7V4h6v3" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path
        d="M6 7h12l-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7Z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path d="M10 11v6M14 11v6" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

interface FillableIconProps extends IconProps {
  filled?: boolean;
}

export function StarIcon({ color, size = 16, filled = false }: FillableIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3.5l2.65 5.37 5.93.86-4.29 4.18 1.01 5.9L12 17l-5.3 2.81 1.01-5.9-4.29-4.18 5.93-.86L12 3.5Z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
      />
    </Svg>
  );
}

export function GhostIcon({ color, size = 16 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 20V11a7 7 0 0 1 14 0v9l-2.5-2-2 2-2.5-2-2.5 2-2-2-2.5 2Z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Circle cx={9.5} cy={11} r={1} fill={color} />
      <Circle cx={14.5} cy={11} r={1} fill={color} />
    </Svg>
  );
}

export function SlidersIcon({ color, size = 16 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 6h10M18 6h2M4 18h2M10 18h10"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Path d="M4 12h4M12 12h8" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={16} cy={6} r={2} stroke={color} strokeWidth={2} />
      <Circle cx={8} cy={12} r={2} stroke={color} strokeWidth={2} />
      <Circle cx={6} cy={18} r={2} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

export function TrashIcon({ color, size = 16 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7h16M9 7V4h6v3" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Rect x={6} y={7} width={12} height={13} rx={1} stroke={color} strokeWidth={2} />
      <Path d="M10 11v6M14 11v6" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function FilterIcon({ color, size = 16 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 5h16l-6 7v6l-4 2v-8L4 5Z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function ChevronDownIcon({ color, size = 14 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 9l6 6 6-6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CheckIcon({ color, size = 14 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 6L9 17l-5-5"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
