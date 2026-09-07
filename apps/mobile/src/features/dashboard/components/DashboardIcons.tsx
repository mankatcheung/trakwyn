import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export interface DashboardIconProps {
  color: string;
}

const SIZE = 18;
const STROKE = 2;

export function BriefcaseIcon({ color }: DashboardIconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={7} width={18} height={13} rx={2} stroke={color} strokeWidth={STROKE} />
      <Path
        d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function DocumentIcon({ color }: DashboardIconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Path d="M9 12h6M9 16h6" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  );
}

export function ClockIcon({ color }: DashboardIconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={STROKE} />
      <Path d="M12 7v5l3.5 2" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  );
}

export function CheckCircleIcon({ color }: DashboardIconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={STROKE} />
      <Path
        d="M8.5 12.5l2.2 2.2L15.5 9.5"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function AlertCircleIcon({ color }: DashboardIconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={STROKE} />
      <Path d="M12 8v5" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Circle cx={12} cy={16} r={1} fill={color} />
    </Svg>
  );
}
