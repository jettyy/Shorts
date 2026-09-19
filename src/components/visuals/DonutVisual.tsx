import React from 'react';
import { BASE, type Accent } from '../../theme';
import { NEUTRAL_RAMP } from '../chartTheme';
import { useDraw, useReveal } from './useReveal';
import type { DonutVisual as Data } from '../../types';

const SIZE = 340;
const STROKE = 62;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

/**
 * 도넛 그래프 — 전체 중 비중.
 * 조각은 최대 3개까지만 쓴다(그 이상은 읽히지 않는다).
 * 조각 사이에 배경색 간격을 둬서 경계가 분명하게 보이도록 했다.
 */
export const DonutVisual: React.FC<{ data: Data; accent: Accent }> = ({ data, accent }) => {
  const draw = useDraw(8, 28);
  const legendIn = useReveal(16);

  const total = data.slices.reduce((s, x) => s + x.value, 0) || 1;
  const anyHighlight = data.slices.some((s) => s.highlight);

  let offset = 0;
  let neutralIdx = 0;
  const arcs = data.slices.map((slice, i) => {
    const frac = slice.value / total;
    const highlight = anyHighlight ? Boolean(slice.highlight) : i === 0;
    // 강조 조각만 accent, 나머지는 명도만 다른 회색 — 시선이 한 곳으로 가게
    const color = highlight
      ? accent.primary
      : NEUTRAL_RAMP[Math.min(neutralIdx++, NEUTRAL_RAMP.length - 1)];
    const arc = { frac, offset, color, highlight, slice };
    offset += frac;
    return arc;
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 46 }}>
      <svg width={SIZE} height={SIZE} style={{ flexShrink: 0 }}>
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          {arcs.map((a, i) => (
            <circle
              key={i}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth={STROKE}
              // 조각 사이 2px 간격 — 인접한 면이 붙어 보이지 않게
              strokeDasharray={`${Math.max(C * a.frac * draw - 4, 0)} ${C}`}
              strokeDashoffset={-C * a.offset * draw}
              strokeLinecap="butt"
            />
          ))}
        </g>
        {data.centerLabel ? (
          <text
            x={SIZE / 2}
            y={SIZE / 2 + 16}
            textAnchor="middle"
            fill={BASE.white}
            fontSize={48}
            fontWeight={900}
          >
            {data.centerLabel}
          </text>
        ) : null}
      </svg>

      {/* 조각마다 이름과 값을 직접 적는다 — 색만으로 구분하지 않는다 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, opacity: legendIn }}>
        {arcs.map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: a.color,
                flexShrink: 0,
              }}
            />
            <div>
              <div
                style={{
                  fontSize: 34,
                  fontWeight: 700,
                  color: a.highlight ? BASE.white : BASE.textMuted,
                  wordBreak: 'keep-all',
                }}
              >
                {a.slice.label}
              </div>
              <div
                style={{
                  fontSize: 42,
                  fontWeight: 900,
                  color: a.highlight ? accent.bright : BASE.textMuted,
                  letterSpacing: '-0.03em',
                }}
              >
                {Math.round(a.frac * 100)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
