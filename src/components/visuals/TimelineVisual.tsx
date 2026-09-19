import React from 'react';
import { BASE, type Accent } from '../../theme';
import { CONTEXT_SOLID } from '../chartTheme';
import { useDraw, useReveal } from './useReveal';
import type { TimelineVisual as Data } from '../../types';

const Item: React.FC<{
  when: string;
  label: string;
  highlight?: boolean;
  delay: number;
  accent: Accent;
  last: boolean;
}> = ({ when, label, highlight, delay, accent, last }) => {
  const enter = useReveal(delay);
  const lineDraw = useDraw(delay + 4, 12);

  return (
    <div style={{ display: 'flex', gap: 26, opacity: enter }}>
      {/* 시간 축 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 34 }}>
        <span
          style={{
            width: highlight ? 30 : 22,
            height: highlight ? 30 : 22,
            borderRadius: 999,
            background: highlight ? accent.primary : CONTEXT_SOLID,
            flexShrink: 0,
            marginTop: 12,
          }}
        />
        {!last ? (
          <span
            style={{
              width: 4,
              flex: 1,
              minHeight: 52,
              background: CONTEXT_SOLID,
              opacity: 0.45,
              transform: `scaleY(${lineDraw})`,
              transformOrigin: 'top',
            }}
          />
        ) : null}
      </div>

      <div style={{ paddingBottom: last ? 0 : 34 }}>
        <div
          style={{
            fontSize: 30,
            fontWeight: 800,
            color: highlight ? accent.primary : BASE.textDim,
            letterSpacing: '0.02em',
          }}
        >
          {when}
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 42,
            fontWeight: 800,
            color: highlight ? BASE.white : BASE.textMuted,
            letterSpacing: '-0.025em',
            wordBreak: 'keep-all',
            lineHeight: 1.3,
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
};

/**
 * 타임라인 — 시점별로 무엇이 달라지는지.
 * 신청 마감, 제도 변경일처럼 "언제"가 핵심인 정보에 쓴다.
 */
export const TimelineVisual: React.FC<{ data: Data; accent: Accent }> = ({ data, accent }) => (
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    {data.items.map((item, i) => (
      <Item
        key={i}
        when={item.when}
        label={item.label}
        highlight={item.highlight}
        delay={8 + i * 7}
        accent={accent}
        last={i === data.items.length - 1}
      />
    ))}
  </div>
);
