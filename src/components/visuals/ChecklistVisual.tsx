import React from 'react';
import { BASE, type Accent } from '../../theme';
import { GRID, STATUS } from '../chartTheme';
import { fitDensity, type Density } from '../../lib/density';
import { useReveal } from './useReveal';
import type { ChecklistVisual as Data } from '../../types';

const ITEM_H = 96;
const ITEM_GAP = 16;

const Item: React.FC<{ text: string; ok: boolean; delay: number; d: Density }> = ({
  text,
  ok,
  delay,
  d,
}) => {
  const enter = useReveal(delay);
  const color = ok ? STATUS.good : STATUS.bad;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: d.sp(24),
        padding: `${d.sp(22)}px ${d.sp(26)}px`,
        borderRadius: d.sp(20),
        border: `2px solid ${GRID}`,
        background: 'rgba(255,255,255,0.035)',
        opacity: enter,
        transform: `translateX(${(1 - enter) * -20}px)`,
      }}
    >
      {/* 상태는 색 + 기호를 같이 쓴다 — 색만으로 구분하지 않는다 */}
      <span
        style={{
          width: d.sp(52),
          height: d.sp(52),
          borderRadius: 999,
          flexShrink: 0,
          background: `${color}22`,
          border: `3px solid ${color}`,
          color,
          fontSize: d.fs(30),
          fontWeight: 900,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {ok ? '✓' : '✕'}
      </span>
      <span
        style={{
          fontSize: d.fs(40),
          fontWeight: 700,
          color: ok ? BASE.white : BASE.textMuted,
          letterSpacing: '-0.02em',
          wordBreak: 'keep-all',
          lineHeight: 1.3,
        }}
      >
        {text}
      </span>
    </div>
  );
};

/**
 * 해당/비해당 체크리스트 — "나도 대상인가?"를 바로 판단하게 해준다.
 * 조건을 문장으로 나열하는 것보다 훨씬 빨리 읽힌다.
 * 항목 수에 맞춰 크기가 자동으로 줄어든다.
 */
export const ChecklistVisual: React.FC<{ data: Data; accent: Accent }> = ({ data }) => {
  const d = fitDensity(data.items.length * (ITEM_H + ITEM_GAP) - ITEM_GAP, 40);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: d.sp(ITEM_GAP) }}>
      {data.items.map((item, i) => (
        <Item key={i} text={item.text} ok={item.ok} delay={8 + i * 6} d={d} />
      ))}
    </div>
  );
};
