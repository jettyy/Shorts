import React from 'react';
import { BASE, type Accent } from '../../theme';
import { STATUS } from '../chartTheme';
import { useDraw, useReveal } from './useReveal';
import type { StatVisual as Data } from '../../types';

/**
 * 핵심 숫자 하나를 크게 보여준다 (hero number).
 * 값이 하나뿐이면 차트로 만들지 않는 게 맞다 — 숫자 자체가 가장 빠르다.
 */
export const StatVisual: React.FC<{ data: Data; accent: Accent }> = ({ data, accent }) => {
  const enter = useReveal(6);
  const barDraw = useDraw(14, 22);

  return (
    <div style={{ opacity: enter, transform: `translateY(${(1 - enter) * 26}px)` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
        <span
          style={{
            fontSize: 176,
            fontWeight: 900,
            color: accent.bright,
            letterSpacing: '-0.05em',
            lineHeight: 1,
          }}
        >
          {data.value}
        </span>
        {data.unit ? (
          <span style={{ fontSize: 68, fontWeight: 800, color: accent.primary }}>{data.unit}</span>
        ) : null}
      </div>

      <div
        style={{
          marginTop: 24,
          height: 8,
          width: `${barDraw * 100}%`,
          maxWidth: 420,
          borderRadius: 8,
          background: accent.primary,
        }}
      />

      {data.delta ? (
        <div
          style={{
            marginTop: 26,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 38,
            fontWeight: 800,
            color: data.delta.dir === 'up' ? STATUS.good : STATUS.bad,
          }}
        >
          <span>{data.delta.dir === 'up' ? '▲' : '▼'}</span>
          <span>{data.delta.text}</span>
        </div>
      ) : null}

      {data.caption ? (
        <div style={{ marginTop: 22, fontSize: 36, fontWeight: 600, color: BASE.textMuted }}>
          {data.caption}
        </div>
      ) : null}
    </div>
  );
};
