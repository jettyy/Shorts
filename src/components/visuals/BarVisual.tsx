import React from 'react';
import { BASE, type Accent } from '../../theme';
import { CHART, CONTEXT, GRID } from '../chartTheme';
import { fitDensity, type Density } from '../../lib/density';
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
  d: Density;
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
  d,
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
          marginBottom: d.sp(12),
        }}
      >
        <span
          style={{
            fontSize: d.fs(CHART.labelSize),
            fontWeight: 700,
            color: highlight ? BASE.white : BASE.textMuted,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: d.fs(CHART.valueSize),
            fontWeight: 900,
            color: highlight ? accent.bright : BASE.textMuted,
            letterSpacing: '-0.03em',
          }}
        >
          {value.toLocaleString('ko-KR')}
          {unit ? (
            <span style={{ fontSize: d.fs(30), marginLeft: d.sp(6), fontWeight: 700 }}>{unit}</span>
          ) : null}
        </span>
      </div>

      {/* 막대 트랙 — 전체 대비 크기를 알 수 있게 옅게 깔아둔다 */}
      <div
        style={{
          height: d.sp(CHART.barHeight),
          borderRadius: d.sp(CHART.barRadius),
          background: GRID,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${(value / max) * grow * 100}%`,
            height: '100%',
            borderRadius: d.sp(CHART.barRadius),
            background: highlight ? accent.primary : CONTEXT,
          }}
        />
      </div>

      {note ? (
        <div
          style={{
            marginTop: d.sp(10),
            fontSize: d.fs(28),
            color: BASE.textDim,
            fontWeight: 600,
          }}
        >
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
 *
 * 항목 수에 맞춰 막대 두께와 글자가 자동으로 줄어든다.
 */
export const BarVisual: React.FC<{ data: Data; accent: Accent }> = ({ data, accent }) => {
  const max = Math.max(...data.items.map((i) => i.value), 1);
  const anyExplicit = data.items.some((i) => i.highlight);
  const hasNote = data.items.some((i) => i.note);

  // 라벨줄(44) + 여백(12) + 막대(68) + 보조설명(38, 있을 때)
  const perItem = 44 + 12 + CHART.barHeight + (hasNote ? 38 : 0);
  const d = fitDensity(data.items.length * (perItem + CHART.barGap) - CHART.barGap, CHART.labelSize);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: d.sp(CHART.barGap) }}>
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
          d={d}
        />
      ))}
    </div>
  );
};
