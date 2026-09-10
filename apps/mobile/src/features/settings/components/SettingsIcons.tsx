import React from 'react';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

export interface SettingsIconProps {
  color: string;
}

const SIZE = 18;
const STROKE = 2;

export function SlidersIcon({ color }: SettingsIconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
      <Line
        x1={4}
        y1={6}
        x2={20}
        y2={6}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <Line
        x1={4}
        y1={18}
        x2={20}
        y2={18}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <Circle cx={9} cy={6} r={2.5} fill={color} />
      <Circle cx={15} cy={18} r={2.5} fill={color} />
    </Svg>
  );
}

export function ShieldIcon({ color }: SettingsIconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function StarIcon({ color }: SettingsIconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.2-5.4 3.2 1.3-6L3.3 9.2l6.1-.6L12 3Z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function RefreshIcon({ color }: SettingsIconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <Polyline
        points="18,3 18,7 14,7"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Polyline
        points="6,21 6,17 10,17"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function BellIcon({ color }: SettingsIconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Path d="M10 19a2 2 0 0 0 4 0" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  );
}

export function DatabaseIcon({ color }: SettingsIconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 6c0 1.66 3.58 3 8 3s8-1.34 8-3-3.58-3-8-3-8 1.34-8 3Z"
        stroke={color}
        strokeWidth={STROKE}
      />
      <Path d="M4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6" stroke={color} strokeWidth={STROKE} />
      <Path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" stroke={color} strokeWidth={STROKE} />
    </Svg>
  );
}

export function WarningIcon({ color }: SettingsIconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3.5 21 19.5H3L12 3.5Z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Path d="M12 10v4" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Circle cx={12} cy={16.5} r={0.9} fill={color} />
    </Svg>
  );
}

export function PaletteIcon({ color }: SettingsIconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.7 1.6-1.5 0-.4-.2-.7-.4-1-.2-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16a4 4 0 0 0 4-4c0-5-3.6-9-8-9Z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Circle cx={7.5} cy={11} r={1.1} fill={color} />
      <Circle cx={9.5} cy={7.2} r={1.1} fill={color} />
      <Circle cx={14.5} cy={7.2} r={1.1} fill={color} />
    </Svg>
  );
}

export function GlobeIcon({ color }: SettingsIconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={STROKE} />
      <Path
        d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"
        stroke={color}
        strokeWidth={STROKE}
      />
    </Svg>
  );
}

export function ChartIcon({ color }: SettingsIconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={12} width={4} height={8} rx={1} stroke={color} strokeWidth={STROKE} />
      <Rect x={10} y={7} width={4} height={13} rx={1} stroke={color} strokeWidth={STROKE} />
      <Rect x={16} y={4} width={4} height={16} rx={1} stroke={color} strokeWidth={STROKE} />
    </Svg>
  );
}

export function TrashSettingsIcon({ color }: SettingsIconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <Path
        d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function DocumentIcon({ color }: SettingsIconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Path d="M14 3v4h4" stroke={color} strokeWidth={STROKE} strokeLinejoin="round" />
      <Line
        x1={8.5}
        y1={13}
        x2={15.5}
        y2={13}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <Line
        x1={8.5}
        y1={17}
        x2={13.5}
        y2={17}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function ChevronRightIcon({ color }: SettingsIconProps) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 5l7 7-7 7"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
