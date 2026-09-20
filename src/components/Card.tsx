import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BASE, FONT_FAMILY, LAYOUT, TYPE, TYPE_LABEL, type Accent } from '../theme';
import { fitFontSize, wrapTitle } from '../lib/text';
import { VisualBlock } from './visuals';
import { InstantContext } from './visuals/useReveal';
import type { Card as CardData, SourceInfo } from '../types';

type Props = {
  card: CardData;
  index: number;
  total: number;
  accent: Accent;
  source: SourceInfo;
  /**
   * 첫 카드 여부.
   * 첫 카드는 등장 연출 없이 0프레임부터 완성된 화면으로 그린다.
   * 유튜브·인스타가 첫 프레임을 커버(썸네일)로 잡아가기 때문이다.
   */
  isFirst?: boolean;
};

/**
 * 카드 한 장.
 *
 * 구성: 상단(역할 라벨 + 카드 번호) → 제목 → 강조선 → **시각 자료** → (마지막 장) 출처·CTA
 * 시각 자료가 있는 카드는 제목을 작게 잡는다. 주인공은 도표이지 글자가 아니다.
 *
 * 등장: 아래→위 + 페이드인 + 미세 확대, 퇴장: 위로 밀려나며 사라짐(다음 카드가 아래에서 올라온다)
 */
export const Card: React.FC<Props> = ({ card, index, total, accent, source, isFirst }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const isHook = card.type === 'hook';
  const isLast = index === total;
  const hasVisual = Boolean(card.visual);

  const lines = wrapTitle(card.title, hasVisual ? 17 : 15);
  const fontSize = fitFontSize(lines, isHook, hasVisual);

  // ── 등장 ────────────────────────────────────────────────
  // 첫 카드는 등장 연출을 건너뛴다. 대신 아주 느린 확대로 정지 화면처럼 보이지 않게 한다.
  const enter = spring({
    frame,
    fps,
    config: { damping: 200, mass: 0.7, stiffness: 120 },
    durationInFrames: 22,
  });
  const slowZoom = interpolate(frame, [0, Math.max(durationInFrames, 1)], [1, 1.03], {
    extrapolateRight: 'clamp',
  });
  const enterY = isFirst ? 0 : interpolate(enter, [0, 1], [190, 0]);
  const enterScale = isFirst ? slowZoom : interpolate(enter, [0, 1], [0.94, 1]);
  const enterOpacity = isFirst
    ? 1
    : interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });

  // ── 퇴장 ────────────────────────────────────────────────
  const exitStart = Math.max(durationInFrames - 10, 1);
  const exitProgress = interpolate(frame, [exitStart, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.quad),
  });
  const exitY = exitProgress * -230;
  const exitOpacity = 1 - Math.min(exitProgress * 1.6, 1);

  // ── 강조 언더라인 ───────────────────────────────────────
  const underline = isFirst
    ? 1
    : interpolate(frame, [11, 30], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.out(Easing.cubic),
      });

  const topBarOpacity = isFirst
    ? 1
    : interpolate(frame, [3, 16], [0, 1], { extrapolateRight: 'clamp' });
  const kicker = card.kicker ?? TYPE_LABEL[card.type] ?? '';

  return (
    <InstantContext.Provider value={Boolean(isFirst)}>
      <AbsoluteFill
        style={{
          fontFamily: FONT_FAMILY,
          opacity: exitOpacity,
          transform: `translateY(${exitY}px)`,
        }}
      >
        {/* 상단: 역할 라벨 + 카드 번호 */}
        <div
          style={{
            position: 'absolute',
            top: LAYOUT.paddingTop,
            left: LAYOUT.paddingX,
            right: LAYOUT.paddingX,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 24,
            opacity: topBarOpacity,
          }}
        >
          {kicker ? (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 28px',
                borderRadius: 999,
                border: `2px solid ${accent.soft}`,
                background: accent.glow,
                color: accent.bright,
                fontSize: TYPE.kicker,
                fontWeight: 700,
                letterSpacing: '-0.01em',
                whiteSpace: 'nowrap',
              }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: accent.primary,
                  boxShadow: `0 0 18px ${accent.primary}`,
                }}
              />
              {kicker}
            </div>
          ) : (
            <span />
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 4,
              fontSize: TYPE.indexBadge,
              fontWeight: 800,
              color: BASE.textDim,
              letterSpacing: '0.04em',
            }}
          >
            <span style={{ color: accent.primary, fontSize: TYPE.indexBadge + 8 }}>{index}</span>
            <span>/</span>
            <span>{total}</span>
          </div>
        </div>

        {/* 본문: 제목 + 시각 자료 */}
        <AbsoluteFill
          style={{
            justifyContent: 'center',
            alignItems: 'stretch',
            paddingLeft: LAYOUT.paddingX,
            paddingRight: LAYOUT.paddingX,
            paddingTop: LAYOUT.paddingTop + 90,
            paddingBottom: LAYOUT.paddingBottom + 40,
          }}
        >
          <div
            style={{
              transform: `translateY(${enterY}px) scale(${enterScale})`,
              transformOrigin: 'center center',
              opacity: enterOpacity,
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              flex: 1,
            }}
          >
            <div>
              {lines.map((line, i) => {
                const lineIn = isFirst
                  ? 1
                  : spring({
                      frame: frame - i * 3,
                      fps,
                      config: { damping: 200, mass: 0.6, stiffness: 130 },
                      durationInFrames: 20,
                    });
                return (
                  <div
                    key={i}
                    style={{
                      fontSize,
                      lineHeight: 1.26,
                      fontWeight: isHook ? 900 : 800,
                      color: BASE.white,
                      letterSpacing: '-0.035em',
                      wordBreak: 'keep-all',
                      transform: `translateY(${interpolate(lineIn, [0, 1], [26, 0])}px)`,
                      opacity: lineIn,
                      textShadow: '0 8px 30px rgba(0,0,0,0.45)',
                    }}
                  >
                    {line}
                  </div>
                );
              })}
            </div>

            {card.body ? (
              <div
                style={{
                  marginTop: 18,
                  fontSize: TYPE.body,
                  fontWeight: 600,
                  color: BASE.textMuted,
                  letterSpacing: '-0.02em',
                  wordBreak: 'keep-all',
                  opacity: isFirst
                    ? 1
                    : interpolate(frame, [12, 26], [0, 1], { extrapolateRight: 'clamp' }),
                }}
              >
                {card.body}
              </div>
            ) : null}

            {/* 강조 언더라인 */}
            <div
              style={{
                marginTop: 30,
                height: 8,
                width: `${underline * 100}%`,
                maxWidth: 420,
                borderRadius: 999,
                background: `linear-gradient(90deg, ${accent.bright} 0%, ${accent.primary} 60%, rgba(0,0,0,0) 100%)`,
                boxShadow: `0 0 26px ${accent.soft}`,
                flexShrink: 0,
              }}
            />

            {/* 시각 자료 — 이 카드의 주인공 */}
            {card.visual ? (
              <div style={{ marginTop: 52 }}>
                <VisualBlock visual={card.visual} accent={accent} />
              </div>
            ) : null}

            {/* 마지막 카드: 짧은 CTA 한 줄 (카드 한 장을 통째로 쓰지 않는다) */}
            {isLast && card.cta ? (
              <div
                style={{
                  marginTop: 46,
                  fontSize: 40,
                  fontWeight: 800,
                  color: accent.bright,
                  letterSpacing: '-0.02em',
                  opacity: isFirst
                    ? 1
                    : interpolate(frame, [24, 40], [0, 1], { extrapolateRight: 'clamp' }),
                }}
              >
                {card.cta}
              </div>
            ) : null}
          </div>
        </AbsoluteFill>

        {/* 마지막 카드 하단: 출처와 확인 기준일 */}
        {isLast ? (
          <div
            style={{
              position: 'absolute',
              left: LAYOUT.paddingX,
              right: LAYOUT.paddingX,
              bottom: LAYOUT.paddingBottom + 26,
              fontSize: 26,
              fontWeight: 600,
              color: BASE.textDim,
              letterSpacing: '-0.01em',
              opacity: isFirst
                ? 1
                : interpolate(frame, [26, 42], [0, 1], { extrapolateRight: 'clamp' }),
            }}
          >
            출처 {source.publisher ? `${source.publisher} · ` : ''}
            {source.title} / {source.checkedOn} 기준
          </div>
        ) : null}
      </AbsoluteFill>
    </InstantContext.Provider>
  );
};
