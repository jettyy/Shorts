import React from 'react';
import { BASE, type Accent } from '../../theme';
import { CONTEXT, GRID, NEUTRAL_RAMP } from '../chartTheme';
import { fitDensity } from '../../lib/density';
import { useDraw, useReveal } from './useReveal';
import { barValues } from '../../lib/amount';
import { STYLE } from '../../lib/style';
import type { RankListVisual as Data } from '../../types';

/** 설계 원본 크기 (항목이 적을 때 쓰이는 최대 크기) */
const ROW_H = 84;
const ROW_GAP = 12;

type RowProps = {
  rank: number;
  label: string;
  note?: string;
  value: string;
  unit?: string;
  /** 0~1. 막대 길이 (없으면 막대를 안 그린다) */
  ratio: number | null;
  highlight: boolean;
  /** 가려진 행인가 (1번 카드 예고용 — 순위 숫자만 남기고 흐리게) */
  hidden?: boolean;
  delay: number;
  accent: Accent;
  h: number;
  fs: (px: number) => number;
  sp: (px: number) => number;
};

const RankRow: React.FC<RowProps> = ({
  rank,
  label,
  note,
  value,
  unit,
  ratio,
  highlight,
  hidden = false,
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
            opacity: hidden ? 0.45 : 1,
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

      {/* 이름 (+ 한마디) — 가려진 행은 흐리게 해서 "있다"는 것만 남긴다 */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          minWidth: 0,
          filter: hidden ? `blur(${sp(13)}px)` : undefined,
          opacity: hidden ? 0.5 : 1,
        }}
      >
        <div
          style={{
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
        {note ? (
          <div
            style={{
              marginTop: sp(2),
              fontSize: fs(23),
              fontWeight: 600,
              color: CONTEXT,
              letterSpacing: '-0.02em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {note}
          </div>
        ) : null}
      </div>

      {/* 값 — 영상엔 마우스 오버가 없으니 항상 직접 찍는다 */}
      <div
        style={{
          position: 'relative',
          flexShrink: 0,
          filter: hidden ? `blur(${sp(13)}px)` : undefined,
          opacity: hidden ? 0.5 : 1,
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

  /*
   * 막대 길이.
   * barValue 를 직접 안 적었으면 value 에서 읽어낸다 — 대본에서 빠뜨려도
   * 막대가 깔리게. 한 줄이라도 못 읽으면 통째로 끈다(일부만 깔리면 오해를 부른다).
   */
  const bars = barValues(items);
  const maxBar = bars ? Math.max(...bars) : 0;

  /*
   * 등장 순서. 목록이 위에서 아래로 그냥 깔리면 "다 봤다"는 느낌에 중간에 나간다.
   * 무엇을 언제 보여주느냐가 시청 지속과 직결되므로 순서를 고를 수 있게 한다.
   * **자리(위치)는 그대로 두고 등장 타이밍만 바꾼다** — 순위가 뒤섞이면 안 된다.
   */
  /*
   * 몇 등까지 선명하게 보여줄지. 나머지는 흐릿하게 가려둔다(1번 카드 예고용).
   * 0 이나 음수를 주면 전부 가려져 아무 정보가 없으므로 최소 1행은 남긴다.
   */
  const reveal =
    typeof data.revealCount === 'number'
      ? Math.max(1, Math.min(items.length, Math.floor(data.revealCount)))
      : items.length;

  const order = data.reveal ?? STYLE.rank.reveal;
  const delayOf = (i: number) => {
    const last = items.length - 1;
    if (order === 'countdown') return 6 + (last - i) * 4;
    if (order === 'winner-first') {
      // 1위(가장 높은 순위 = 배열 첫 항목)를 먼저 꽂고, 나머지를 이어 붙인다
      const top = items.reduce(
        (best, it, idx) => ((it.rank ?? idx + 1) < (items[best].rank ?? best + 1) ? idx : best),
        0,
      );
      if (i === top) return 6;
      return 18 + (i < top ? i : i - 1) * 4;
    }
    return 6 + i * 4;
  };

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
            note={item.note}
            value={item.value}
            unit={data.unit}
            ratio={bars && maxBar > 0 ? bars[i] / maxBar : null}
            highlight={Boolean(item.highlight)}
            hidden={i >= reveal}
            delay={delayOf(i)}
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
