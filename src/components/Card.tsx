import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONT_FAMILY, LAYOUT, TYPE } from '../theme';
import { fitFontSize, wrapTitle } from '../lib/text';
import type { Card as CardData } from '../types';

type Props = {
  card: CardData;
  index: number;
  total: number;
};

/**
 * 카드 한 장.
 * 등장: 아래→위로 살짝 올라오며 페이드인 + 미세 확대.
 * 강조: 제목 아래 골드 언더라인이 왼쪽에서 오른쪽으로 슥 그려진다.
 * 퇴장: 마지막 순간에 살짝 위로 빠지며 페이드아웃.
 */
export const Card: React.FC<Props> = ({ card, index, total }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const isHook = Boolean(card.isHook);
  const isCta = Boolean(card.isCta);

  const lines = wrapTitle(card.title);
  const fontSize = fitFontSize(lines, isHook);

  // ── 등장 ────────────────────────────────────────────────
  const enter = spring({
    frame,
    fps,
    config: { damping: 200, mass: 0.7, stiffness: 120 },
    durationInFrames: 22,
  });
  const enterY = interpolate(enter, [0, 1], [190, 0]);
  const enterScale = interpolate(enter, [0, 1], [0.94, 1]);
  const enterOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });

  // ── 퇴장 ────────────────────────────────────────────────
  const exitStart = Math.max(durationInFrames - 10, 1);
  const exitProgress = interpolate(frame, [exitStart, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.quad),
  });
  // 위로 크게 밀어내서, 아래에서 올라오는 다음 카드와 글자가 겹치지 않게 한다.
  const exitY = exitProgress * -230;
  // 투명도는 더 빨리 떨어뜨린다(겹침 구간에 잔상이 남지 않도록).
  const exitOpacity = 1 - Math.min(exitProgress * 1.6, 1);

  // ── 골드 언더라인 ───────────────────────────────────────
  const underline = interpolate(frame, [13, 34], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  // ── 상단 바 ─────────────────────────────────────────────
  const topBarOpacity = interpolate(frame, [4, 18], [0, 1], { extrapolateRight: 'clamp' });

  const titleColor = isCta ? COLORS.goldBright : COLORS.white;

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT_FAMILY,
        opacity: exitOpacity,
        transform: `translateY(${exitY}px)`,
      }}
    >
      {/* 상단: 키커 + 카드 번호 */}
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
        {card.kicker ? (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 28px',
              borderRadius: 999,
              border: `2px solid ${COLORS.goldSoft}`,
              background: 'rgba(232, 180, 74, 0.10)',
              color: COLORS.goldBright,
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
                background: COLORS.gold,
                boxShadow: `0 0 18px ${COLORS.gold}`,
              }}
            />
            {card.kicker}
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
            color: COLORS.textDim,
            letterSpacing: '0.04em',
          }}
        >
          <span style={{ color: COLORS.gold, fontSize: TYPE.indexBadge + 8 }}>{index}</span>
          <span>/</span>
          <span>{total}</span>
        </div>
      </div>

      {/* 중앙: 제목 + 언더라인 */}
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'flex-start',
          paddingLeft: LAYOUT.paddingX,
          paddingRight: LAYOUT.paddingX,
          // 하단 쇼츠 UI 영역을 피해 본문을 화면 위쪽(약 46% 지점)으로 올린다.
          paddingBottom: 300,
        }}
      >
        <div
          style={{
            transform: `translateY(${enterY}px) scale(${enterScale})`,
            transformOrigin: 'left center',
            opacity: enterOpacity,
            width: '100%',
          }}
        >
          {lines.map((line, i) => {
            // 줄마다 아주 살짝 시간차를 둬서 읽는 흐름을 만든다
            const lineIn = spring({
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
                  fontWeight: isHook || isCta ? 900 : 800,
                  color: titleColor,
                  letterSpacing: '-0.035em',
                  wordBreak: 'keep-all',
                  transform: `translateY(${interpolate(lineIn, [0, 1], [26, 0])}px)`,
                  opacity: lineIn,
                  textShadow: isCta
                    ? `0 0 48px rgba(232,180,74,0.35), 0 8px 30px rgba(0,0,0,0.45)`
                    : '0 8px 30px rgba(0,0,0,0.45)',
                }}
              >
                {line}
              </div>
            );
          })}

          {/* 골드 언더라인 */}
          <div
            style={{
              marginTop: 40,
              height: 10,
              width: `${underline * 100}%`,
              maxWidth: 540,
              borderRadius: 999,
              background: `linear-gradient(90deg, ${COLORS.goldBright} 0%, ${COLORS.gold} 60%, rgba(232,180,74,0) 100%)`,
              boxShadow: `0 0 26px ${COLORS.goldSoft}`,
            }}
          />

          {/* CTA 카드에만 붙는 보조 문구 — 언더라인 바로 아래에 붙여 쇼츠 UI를 피한다 */}
          {isCta ? (
            <div
              style={{
                marginTop: 44,
                opacity: interpolate(frame, [22, 40], [0, 1], { extrapolateRight: 'clamp' }),
                color: COLORS.textMuted,
                fontSize: 38,
                fontWeight: 700,
                letterSpacing: '-0.02em',
              }}
            >
              저장해두면 필요할 때 바로 꺼내볼 수 있어요
            </div>
          ) : null}
        </div>
      </AbsoluteFill>

    </AbsoluteFill>
  );
};
