import React from 'react';
import type { Accent } from '../../theme';
import type { Visual } from '../../types';
import { StatVisual } from './StatVisual';
import { BarVisual } from './BarVisual';
import { TrendVisual } from './TrendVisual';
import { DonutVisual } from './DonutVisual';
import { FlowVisual } from './FlowVisual';
import { CalcVisual } from './CalcVisual';
import { ChecklistVisual } from './ChecklistVisual';
import { TableVisual } from './TableVisual';
import { TimelineVisual } from './TimelineVisual';

/**
 * visual.kind 에 맞는 시각 자료를 그려준다.
 * 새 도표 종류를 추가할 때는 types.ts 의 Visual 유니온에 타입을 넣고 여기에 분기를 추가하면 된다.
 */
export const VisualBlock: React.FC<{ visual: Visual; accent: Accent }> = ({ visual, accent }) => {
  switch (visual.kind) {
    case 'stat':
      return <StatVisual data={visual} accent={accent} />;
    case 'bar':
      return <BarVisual data={visual} accent={accent} />;
    case 'trend':
      return <TrendVisual data={visual} accent={accent} />;
    case 'donut':
      return <DonutVisual data={visual} accent={accent} />;
    case 'flow':
      return <FlowVisual data={visual} accent={accent} />;
    case 'calc':
      return <CalcVisual data={visual} accent={accent} />;
    case 'checklist':
      return <ChecklistVisual data={visual} accent={accent} />;
    case 'table':
      return <TableVisual data={visual} accent={accent} />;
    case 'timeline':
      return <TimelineVisual data={visual} accent={accent} />;
    default:
      return null;
  }
};
