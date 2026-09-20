import React from 'react';
import { BASE, type Accent } from '../../theme';
import { AXIS, CHART, GRID } from '../chartTheme';
import { useDraw } from './useReveal';
import type { TrendVisual as Data } from '../../types';

const W = 900;
const H = 380;
const PAD_L = 10;
const PAD_R = 10;
const PAD_T = 40;
const PAD_B = 70;

/**
 * 꺾은선 그래프 — 시간에 따른 변화.
 * 선이 왼쪽에서 오른쪽으로 그려지고, 마지막 값에 라벨이 붙는다.
 * 축은 뒤로 물러나고(옅은 회색) 데이터가 앞에 선다.
 */
export const TrendVisual: React.FC<{ data: Data; accent: Accent }> = ({ data, accent }) => {
  const pts = data.points;
  const draw = useDraw(10, 34);
  const labelIn = useDraw(30, 14);

  const values = pts.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const x = (i: number) => PAD_L + (i / Math.max(pts.length - 1, 1)) * (W - PAD_L - PAD_R);
  const y = (v: number) => PAD_T + (1 - (v - min) / span) * (H - PAD_T - PAD_B);

  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.value)}`).join(' ');
  const area = `${path} L ${x(pts.length - 1)} ${H - PAD_B} L ${x(0)} ${H - PAD_B} Z`;

  // 선 길이를 대략적으로 재서 stroke-dash 로 그려지는 연출을 만든다
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(x(i) - x(i - 1), y(pts[i].value) - y(pts[i - 1].value));
  }

  const lastIdx = pts.length - 1;
  const showLast = data.highlightLast !== false;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      {/* 기준선 (최솟값) — 눈금은 최소한만 */}
      <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke={AXIS} strokeWidth={2} />
      <line x1={PAD_L} y1={y(max)} x2={W - PAD_R} y2={y(max)} stroke={GRID} strokeWidth={2} />

      {/* 선 아래 옅은 면 — 추세의 방향을 한눈에 */}
      <path d={area} fill={accent.primary} opacity={0.12 * draw} />

      <path
        d={path}
        fill="none"
        stroke={accent.primary}
        strokeWidth={CHART.lineWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - draw)}
      />

      {pts.map((p, i) => {
        const appear = draw >= (i / Math.max(pts.length - 1, 1)) * 0.95;
        const isLast = i === lastIdx && showLast;
        return (
          <g key={i} opacity={appear ? 1 : 0}>
            {/* 점 둘레에 배경색 링을 둬서 선과 겹쳐도 구분된다 */}
            <circle
              cx={x(i)}
              cy={y(p.value)}
              r={CHART.dotSize / 2 + 4}
              fill={accent.surface}
            />
            <circle
              cx={x(i)}
              cy={y(p.value)}
              r={isLast ? CHART.dotSize / 2 + 3 : CHART.dotSize / 2}
              fill={isLast ? accent.bright : accent.primary}
            />
            <text
              x={x(i)}
              y={H - PAD_B + 46}
              fill={isLast ? BASE.white : BASE.textDim}
              fontSize={30}
              fontWeight={700}
              textAnchor={i === 0 ? 'start' : i === lastIdx ? 'end' : 'middle'}
            >
              {p.label}
            </text>
          </g>
        );
      })}

      {/* 마지막 값만 직접 라벨 — 모든 점에 숫자를 찍으면 읽히지 않는다 */}
      {showLast ? (
        <text
          x={x(lastIdx)}
          y={y(pts[lastIdx].value) - 34}
          fill={accent.bright}
          fontSize={52}
          fontWeight={900}
          textAnchor="end"
          opacity={labelIn}
        >
          {pts[lastIdx].value.toLocaleString('ko-KR')}
          {data.unit ?? ''}
        </text>
      ) : null}
    </svg>
  );
};
