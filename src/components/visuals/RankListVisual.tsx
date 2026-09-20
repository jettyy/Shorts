import React from 'react';
import { BASE, type Accent } from '../../theme';
import { CONTEXT, GRID, NEUTRAL_RAMP } from '../chartTheme';
import { fitDensity } from '../../lib/density';
import { useDraw, useReveal } from './useReveal';
import type { RankListVisual as Data } from '../../types';

/** 설계 원본 크기 (항목이 적을 때 쓰이는 최대 크기) */
const ROW_H = 84;
const ROW_GAP = 12;

type RowProps = {
  rank: number;
  label: string;
  value: string;
  unit?: string;
  /** 0~1. 막대 길이 (없으면 막대를 안 그린다) */
  ratio: number | null;
  highlight: boolean;
  delay: number;
  accent: Accent;
  h: number;
  fs: (px: number) => number;
  sp: (px: number) => number;
};

const RankRow: React.FC<RowProps> = ({
  rank,
  label,
  value,
  unit,
  ratio,
  highlight,
  delay,
  accent,
  h,
  fs,
  sp,
}) => {
  const enter = useReveal(delay, 14);
  const grow = useDraw(delay, 20);

  /**
   * 강조하지 않는 행은 무채색으로 둔다.
   * 순위마다 다른 색을 주면(금·은·동 같은) 시선이 흩어지고,
   * accent 와 비슷한 색이 섞이면 강조한 행이 안 보인다.
   * 상위 3위만 아주 살짝 밝게 해서 순서감만 남긴다.
   */
  const rankColor = highlight ? accent.primary : rank <= 3 ? NEUTRAL_RAMP[0] : NEUTRAL_RAMP[1];

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: sp(18),
        height: h,
        paddingLeft: sp(14),
        paddingRight: sp(18),
        borderRadius: sp(14),
        overflow: 'hidden',
        background: highlight ? accent.glow : 'rgba(255,255,255,0.035)',
        border: `2px solid ${highlight ? accent.soft : GRID}`,
        opacity: enter,
        transform: `translateX(${(1 - enter) * -22}px)`,
      }}
    >
      {/* 값 크기를 보여주는 막대 — 글자 뒤에 옅게 깔린다 */}
      {ratio !== null ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${ratio * grow * 100}%`,
            background: highlight ? accent.soft : 'rgba(255,255,255,0.055)',
          }}
        />
      ) : null}

      {/* 순위 */}
      <div
        style={{
          position: 'relative',
          width: sp(72),
          flexShrink: 0,
          textAlign: 'right',
          fontSize: fs(rank >= 100 ? 34 : 40),
          fontWeight: 900,
          color: rankColor,
          letterSpacing: '-0.04em',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {rank}
      </div>

      {/* 이름 */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          minWidth: 0,
          fontSize: fs(36),
          fontWeight: highlight ? 900 : 700,
          color: highlight ? BASE.white : BASE.textMuted,
          letterSpacing: '-0.03em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </div>

      {/* 값 — 영상엔 마우스 오버가 없으니 항상 직접 찍는다 */}
      <div
        style={{
          position: 'relative',
          flexShrink: 0,
          fontSize: fs(38),
          fontWeight: 900,
          color: highlight ? accent.bright : BASE.white,
          letterSpacing: '-0.03em',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
        {unit ? (
          <span style={{ fontSize: fs(27), marginLeft: sp(5), fontWeight: 700, color: CONTEXT }}>
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
};

/**
 * 순위 목록 — TOP N / 랭킹.
 *
 * 순위 콘텐츠는 **끝까지 보여주는 것이 핵심**이라 항목 수를 제한하지 않는다.
 * 대신 항목이 많아지면 행 높이와 글자가 자동으로 줄어든다(`lib/density.ts`).
 * 한 장에 다 넣기엔 너무 많으면 대본에서 여러 카드로 나눠 싣는다
 * (그 편이 "다음 순위가 뭔지" 기다리게 해서 시청 지속에도 유리하다).
 *
 * 색 규칙은 다른 도표와 같다 — 강조는 하나, 나머지는 무채색.
 */
export const RankListVisual: React.FC<{ data: Data; accent: Accent }> = ({ data, accent }) => {
  const items = data.items ?? [];
  const natural = items.length * (ROW_H + ROW_GAP) - ROW_GAP;
  const d = fitDensity(natural, 36); // 기관명(36)이 읽혀야 한다

  const h = d.sp(ROW_H);
  const gap = d.sp(ROW_GAP);

  // 막대는 이 카드에 실린 값들 중 최댓값 기준으로 그린다
  const maxBar = Math.max(...items.map((i) => i.barValue ?? 0), 0);

  return (
    <div>
      {data.totalRanks ? (
        <div
          style={{
            marginBottom: gap,
            fontSize: d.fs(26),
            fontWeight: 700,
            color: BASE.textDim,
            letterSpacing: '0.02em',
          }}
        >
          전체 {data.totalRanks}위 중
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap }}>
        {items.map((item, i) => (
          <RankRow
            key={i}
            rank={item.rank ?? i + 1}
            label={item.label}
            value={item.value}
            unit={data.unit}
            ratio={maxBar > 0 && item.barValue ? item.barValue / maxBar : null}
            highlight={Boolean(item.highlight)}
            delay={6 + i * 4}
            accent={accent}
            h={h}
            fs={d.fs}
            sp={d.sp}
          />
        ))}
      </div>
    </div>
  );
};
