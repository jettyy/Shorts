import React from 'react';
import { BASE, type Accent } from '../../theme';
import { GRID } from '../chartTheme';
import { useReveal } from './useReveal';
import type { CalcVisual as Data } from '../../types';

const Line: React.FC<{
  label: string;
  value: string;
  delay: number;
  emphasis?: boolean;
  accent: Accent;
}> = ({ label, value, delay, emphasis, accent }) => {
  const enter = useReveal(delay);
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        padding: emphasis ? '26px 0 6px' : '16px 0',
        borderTop: emphasis ? `3px solid ${accent.soft}` : `2px solid ${GRID}`,
        opacity: enter,
        transform: `translateX(${(1 - enter) * -14}px)`,
      }}
    >
      <span
        style={{
          fontSize: emphasis ? 44 : 36,
          fontWeight: emphasis ? 800 : 600,
          color: emphasis ? BASE.white : BASE.textMuted,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: emphasis ? 62 : 42,
          fontWeight: 900,
          color: emphasis ? accent.bright : BASE.white,
          letterSpacing: '-0.03em',
        }}
      >
        {value}
      </span>
    </div>
  );
};

/**
 * 직접 계산한 내역.
 * "얼마다"라고 말만 하는 것과, 계산 과정을 보여주는 것은 다르다.
 * 항목이 하나씩 쌓이고 마지막에 합계가 강조된다.
 */
export const CalcVisual: React.FC<{ data: Data; accent: Accent }> = ({ data, accent }) => (
  <div>
    {data.lines.map((line, i) => (
      <Line key={i} label={line.label} value={line.value} delay={8 + i * 6} accent={accent} />
    ))}
    <Line
      label={data.result.label}
      value={data.result.value}
      delay={10 + data.lines.length * 6}
      emphasis
      accent={accent}
    />
  </div>
);
