import React from 'react';
import { BASE, type Accent } from '../../theme';
import { CHART, CONTEXT, GRID } from '../chartTheme';
import { useDraw, useReveal } from './useReveal';
import type { BarVisual as Data } from '../../types';

type RowProps = {
  label: string;
  value: number;
  note?: string;
  unit?: string;
  max: number;
  highlight: boolean;
  delay: number;
  accent: Accent;
};

const BarRow: React.FC<RowProps> = ({
  label,
  value,
  note,
  unit,
  max,
  highlight,
  delay,
  accent,
}) => {
  const grow = useDraw(delay, 24);
  const fade = useReveal(delay);

  return (
    <div style={{ opacity: fade }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: CHART.labelSize,
            fontWeight: 700,
            color: highlight ? BASE.white : BASE.textMuted,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: CHART.valueSize,
            fontWeight: 900,
            color: highlight ? accent.bright : BASE.textMuted,
            letterSpacing: '-0.03em',
          }}
        >
          {value.toLocaleString('ko-KR')}
          {unit ? <span style={{ fontSize: 30, marginLeft: 6, fontWeight: 700 }}>{unit}</span> : null}
        </span>
      </div>

      {/* 막대 트랙 — 전체 대비 크기를 알 수 있게 옅게 깔아둔다 */}
      <div
        style={{
          height: CHART.barHeight,
          borderRadius: CHART.barRadius,
          background: GRID,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${(value / max) * grow * 100}%`,
            height: '100%',
            borderRadius: CHART.barRadius,
            background: highlight ? accent.primary : CONTEXT,
          }}
        />
      </div>

      {note ? (
        <div style={{ marginTop: 10, fontSize: 28, color: BASE.textDim, fontWeight: 600 }}>
          {note}
        </div>
      ) : null}
    </div>
  );
};

/**
 * 가로 막대그래프 — 항목 간 크기 비교.
 * 세로 화면에서는 가로 막대가 유리하다(긴 한글 라벨이 그대로 들어간다).
 * 막대마다 값을 직접 찍어서, 색만으로 구분하지 않게 한다.
 *
 * 강조 규칙: highlight를 지정한 항목만 accent 색, 아무것도 지정 안 하면 최댓값을 강조.
 * (4초 안에 시선이 한 곳으로 가야 한다)
 */
export const BarVisual: React.FC<{ data: Data; accent: Accent }> = ({ data, accent }) => {
  const max = Math.max(...data.items.map((i) => i.value), 1);
  const anyExplicit = data.items.some((i) => i.highlight);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: CHART.barGap }}>
      {data.items.map((item, i) => (
        <BarRow
          key={i}
          label={item.label}
          value={item.value}
          note={item.note}
          unit={data.unit}
          max={max}
          highlight={anyExplicit ? Boolean(item.highlight) : item.value === max}
          delay={8 + i * 5}
          accent={accent}
        />
      ))}
    </div>
  );
};
