import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BASE, FONT_FAMILY, LAYOUT, TYPE, TYPE_LABEL, type Accent } from '../theme';
import { fitBannerSize, fitFontSize, wrapTitle } from '../lib/text';
import { emphasize } from '../lib/emphasis';
import { STYLE } from '../lib/style';
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

  /*
   * 1번 카드는 **주제 배너가 화면에서 가장 큰 글자**여야 한다.
   *
   * 첫 0.5초에 판단되는 건 "이게 무슨 영상인가" 하나다. 예전에는 배너가 56px 고정이라
   * 제목·큰 숫자보다 작았고, 그래서 눈이 숫자에 먼저 닿았다 — 그것만 봐서는
   * 아무 뜻이 없는 숫자인데도. 그래서 1번 카드에서는 배너를 키우고 제목을 그 아래로 낮춘다.
   */
  const heroBanner = Boolean(isFirst && card.headline);

  const lines = wrapTitle(card.title, hasVisual ? 17 : 15);
  const natural = fitFontSize(lines, isHook, hasVisual);
  // 배너보다 제목이 크면 주제가 묻힌다. 배너의 62% 를 넘지 않게 눌러둔다.
  const fontSize = heroBanner
    ? Math.min(natural, Math.round(fitBannerSize(card.headline!, true) * 0.62))
    : natural;

  /*
   * 단어를 하나씩 띄우려면 **앞 줄들의 단어 수**를 알아야 한다.
   * 그래야 2번째 줄 첫 단어가 1번째 줄이 다 뜬 뒤에 이어진다.
   */
  const wordsBefore = React.useMemo(() => {
    const counts = lines.map((l) => emphasize(l).length);
    let sum = 0;
    return counts.map((n) => {
      const before = sum;
      sum += n;
      return before;
    });
  }, [lines]);

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
  /*
   * 1번 카드에서는 상단 라벨을 숨긴다.
   * 0프레임에 글자 덩어리가 9개나 있었다(라벨·장수·배너·제목 2줄·보조설명·큰 숫자·단위·설명).
   * 첫 0.5초에 읽히는 건 많아야 두세 개다 — 나머지는 전부 방해물이다.
   */
  const kicker = isFirst ? '' : (card.kicker ?? TYPE_LABEL[card.type] ?? '');

  // ── 주제 배너 ───────────────────────────────────────────
  // 좌우 여백(배너 padding 26×2)을 빼고 한 줄에 들어갈 크기를 잡는다.
  const headlineSize = card.headline ? fitBannerSize(card.headline, heroBanner) : 0;
  const headlineIn = isFirst
    ? 1
    : interpolate(frame, [2, 14], [0, 1], { extrapolateRight: 'clamp' });

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
              // 1번 카드는 위에서부터 쌓는다 — 가운데로 맞추면 주제가 화면 중앙까지 내려온다
              justifyContent: heroBanner ? 'flex-start' : 'center',
              flex: 1,
            }}
          >
            {/*
              주제 배너 — "이게 무슨 영상인지" 를 첫 화면에서 바로 알려준다.
              쇼츠는 무슨 내용인지 모르면 바로 넘어가므로, 제목 위에 accent 색으로 크게 박는다.
              첫 프레임이 썸네일로 잡히는 자리라서 여기서 주제가 읽혀야 한다.
            */}
            {card.headline ? (
              <div
                style={{
                  alignSelf: 'flex-start',
                  maxWidth: '100%',
                  marginBottom: heroBanner ? 30 : 26,
                  padding: heroBanner ? '18px 30px' : '14px 26px',
                  borderRadius: heroBanner ? 20 : 16,
                  background: accent.primary,
                  color: BASE.navyDeepest,
                  fontSize: headlineSize,
                  fontWeight: 900,
                  letterSpacing: '-0.035em',
                  lineHeight: 1.18,
                  wordBreak: 'keep-all',
                  boxShadow: `0 10px 34px ${accent.glow}`,
                  opacity: headlineIn,
                  transform: `translateY(${(1 - headlineIn) * 18}px)`,
                }}
              >
                {card.headline}
              </div>
            ) : null}

            <div>
              {lines.map((line, i) => (
                <TitleLine
                  key={i}
                  line={line}
                  lineIndex={i}
                  before={wordsBefore[i]}
                  frame={frame}
                  fps={fps}
                  fontSize={fontSize}
                  weight={isHook ? 900 : 800}
                  accent={accent}
                  instant={Boolean(isFirst)}
                />
              ))}
            </div>

            {card.body && !isFirst ? (
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

/**
 * 제목 한 줄.
 *
 * 문장을 통째로 띄우지 않고 **단어 단위로 이어서** 띄운다.
 * 쇼츠에서 한 카드에 주어지는 시간은 2~4초라, 정지된 문장은 읽히기 전에 넘어간다.
 * 단어가 하나씩 들어오면 시선이 문장을 따라가면서 끝까지 읽게 된다.
 *
 * 숫자·순위·퍼센트 덩어리(`emphasis`)는 더 크게, 테마 색으로, 살짝 튕기며 들어온다.
 * 그 카드에서 기억해야 할 건 결국 그 숫자 하나다.
 *
 * ⚠️ 1번 카드(`instant`)는 0프레임에 **완성된 화면**이어야 한다.
 *    유튜브·인스타가 첫 프레임을 썸네일로 잡아가기 때문이다.
 *    그래서 등장 연출을 건너뛰되, 강조(크기·색)는 그대로 살린다 —
 *    썸네일에서도 숫자가 커 보여야 눌린다.
 */
const TitleLine: React.FC<{
  line: string;
  lineIndex: number;
  /** 이 줄 앞에 있는 단어 수 (줄이 바뀌어도 순서대로 이어지게) */
  before: number;
  frame: number;
  fps: number;
  fontSize: number;
  weight: number;
  accent: Accent;
  instant: boolean;
}> = ({ line, lineIndex, before, frame, fps, fontSize, weight, accent, instant }) => {
  const tokens = React.useMemo(() => emphasize(line), [line]);
  const { titleReveal, wordStaggerFrames, emphasis } = STYLE.motion;
  const byWord = titleReveal === 'word';
  const accentColor =
    emphasis.color === 'primary' ? accent.primary : emphasis.color === 'soft' ? accent.soft : accent.bright;

  return (
    <div
      style={{
        fontSize,
        lineHeight: 1.26,
        fontWeight: weight,
        color: BASE.white,
        letterSpacing: '-0.035em',
        wordBreak: 'keep-all',
        textShadow: '0 8px 30px rgba(0,0,0,0.45)',
      }}
    >
      {tokens.map((t, i) => {
        // 줄 단위 연출이면 줄 안의 단어는 다 같이 들어온다
        const order = byWord ? before + i : lineIndex * 3;
        const delay = byWord ? order * wordStaggerFrames : order;
        const hot = emphasis.enabled && t.emphasis;

        const enter = instant
          ? 1
          : spring({
              frame: frame - delay,
              fps,
              config: hot && emphasis.bounce
                ? { damping: 11, mass: 0.5, stiffness: 190 } // 튕기며
                : { damping: 200, mass: 0.6, stiffness: 130 },
              durationInFrames: 20,
            });

        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              whiteSpace: 'pre',
              color: hot ? accentColor : undefined,
              fontSize: hot ? fontSize * emphasis.scale : undefined,
              fontWeight: hot ? 900 : undefined,
              // 강조 글자를 키워도 줄 높이가 밀리지 않게 아래로만 정렬한다
              verticalAlign: hot ? '-0.04em' : undefined,
              opacity: instant ? 1 : interpolate(enter, [0, 0.35], [0, 1], {
                extrapolateRight: 'clamp',
              }),
              transform: instant
                ? undefined
                : `translateY(${interpolate(enter, [0, 1], [hot ? 34 : 22, 0])}px)` +
                  (hot ? ` scale(${interpolate(enter, [0, 1], [0.7, 1])})` : ''),
            }}
          >
            {t.text}
          </span>
        );
      })}
    </div>
  );
};
