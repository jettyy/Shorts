import React from 'react';
import { BASE, type Accent } from '../../theme';
import { GRID } from '../chartTheme';
import { fitDensity, type Density } from '../../lib/density';
import { useReveal } from './useReveal';
import type { TableVisual as Data } from '../../types';

const Row: React.FC<{
  label: string;
  a: string;
  b: string;
  delay: number;
  highlightCol?: 0 | 1;
  accent: Accent;
  d: Density;
}> = ({ label, a, b, delay, highlightCol, accent, d }) => {
  const enter = useReveal(delay);
  const cell = (text: string, col: 0 | 1) => (
    <div
      style={{
        flex: 1,
        textAlign: 'center',
        fontSize: 38,
        fontWeight: highlightCol === col ? 900 : 700,
        color: highlightCol === col ? accent.bright : BASE.textMuted,
        letterSpacing: '-0.02em',
        wordBreak: 'keep-all',
      }}
    >
      {text}
    </div>
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: d.sp(12),
        padding: `${d.sp(22)}px 0`,
        borderTop: `2px solid ${GRID}`,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 14}px)`,
      }}
    >
      <div
        style={{
          width: d.sp(300),
          fontSize: d.fs(34),
          fontWeight: 700,
          color: BASE.white,
          wordBreak: 'keep-all',
        }}
      >
        {label}
      </div>
      {cell(a, 0)}
      {cell(b, 1)}
    </div>
  );
};

/**
 * 2열 비교표 — "A와 B가 어떻게 다른가"를 한 화면에 정리.
 * 강조할 열을 지정하면 그 열만 accent 색으로 살아난다.
 * 행 수에 맞춰 크기가 자동으로 줄어든다.
 */
const HEAD_H = 32 + 16;
const ROW_H = 38 + 44; // 글자 + 위아래 padding

export const TableVisual: React.FC<{ data: Data; accent: Accent }> = ({ data, accent }) => {
  const d = fitDensity(HEAD_H + data.rows.length * ROW_H, 34);
  const headIn = useReveal(6);
  const head = (text: string, col: 0 | 1) => (
    <div
      style={{
        flex: 1,
        textAlign: 'center',
        fontSize: d.fs(32),
        fontWeight: 800,
        color: data.highlightCol === col ? accent.primary : BASE.textDim,
        letterSpacing: '0.02em',
      }}
    >
      {text}
    </div>
  );

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: d.sp(12),
          paddingBottom: d.sp(16),
          opacity: headIn,
        }}
      >
        <div style={{ width: d.sp(300) }} />
        {head(data.headers[0], 0)}
        {head(data.headers[1], 1)}
      </div>
      {data.rows.map((r, i) => (
        <Row
          key={i}
          label={r.label}
          a={r.a}
          b={r.b}
          delay={10 + i * 6}
          highlightCol={data.highlightCol}
          accent={accent}
          d={d}
        />
      ))}
    </div>
  );
};
