import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Accent, Texture } from '../theme';

/**
 * 테마별 배경 질감.
 * 색이 비슷해 보여도 결이 다르면 다른 영상으로 읽힌다.
 * 전부 흰색 반투명이라 어떤 배경색 위에서도 같은 세기로 얹힌다.
 */
const TEXTURES: Record<Texture, { image: string; size: string; opacity: number }> = {
  /** 격자 — 도표·수치와 어울리는 기본 결 */
  grid: {
    image:
      'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
    size: '120px 120px',
    opacity: 0.05,
  },
  /** 사선 — 흐름·절차 느낌 */
  diagonal: {
    image:
      'repeating-linear-gradient(48deg, rgba(255,255,255,0.75) 0 2px, rgba(255,255,255,0) 2px 44px)',
    size: 'auto',
    opacity: 0.055,
  },
  /** 점무늬 — 셀 수 있는 것, 경고 표지 느낌 */
  dots: {
    image: 'radial-gradient(rgba(255,255,255,0.95) 3.2px, rgba(255,255,255,0) 3.4px)',
    size: '54px 54px',
    opacity: 0.11,
  },
  /** 동심원 — 비교·확산 느낌 */
  rings: {
    image:
      'repeating-radial-gradient(circle at 50% 78%, rgba(255,255,255,0.75) 0 2px, rgba(255,255,255,0) 2px 108px)',
    size: 'auto',
    opacity: 0.06,
  },
  /**
   * 가로 주사선 — 계측 장비 느낌.
   * 간격을 18px로 넉넉히 둔다. 더 촘촘하면 영상 압축에서 모아레가 생긴다.
   */
  scanline: {
    image:
      'repeating-linear-gradient(0deg, rgba(255,255,255,0.7) 0 2px, rgba(255,255,255,0) 2px 18px)',
    size: 'auto',
    opacity: 0.05,
  },
};

/**
 * 영상 전체에 깔리는 배경.
 * 카드 시퀀스 바깥에 한 번만 깔려서, 카드가 바뀌어도 배경은 끊기지 않고 천천히 흐른다.
 *
 * 테마(accent)가 바뀌면 색만이 아니라 **그라데이션 방향·빛의 위치·질감**이 함께 바뀐다.
 * (색 하나만 바꾸면 화면 대부분을 차지하는 배경이 결국 똑같아 보인다)
 */
export const Background: React.FC<{ accent: Accent }> = ({ accent }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const drift = interpolate(frame, [0, Math.max(durationInFrames, 1)], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const glowY = interpolate(drift, [0, 1], [-60, 120]);
  const glowScale = interpolate(drift, [0, 1], [1, 1.18]);

  const [c0, c1, c2, c3] = accent.bg;
  const [fx, fy] = accent.focus;
  const texture = TEXTURES[accent.texture] ?? TEXTURES.grid;
  const mask = `radial-gradient(980px 980px at ${fx} ${fy}, black 0%, transparent 78%)`;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${accent.bgAngle}deg, ${c0} 0%, ${c1} 34%, ${c2} 72%, ${c3} 100%)`,
      }}
    >
      {/* 포인트 컬러 글로우 — 테마마다 빛이 들어오는 자리가 다르다 */}
      <AbsoluteFill
        style={{
          transform: `translateY(${glowY}px) scale(${glowScale})`,
          background: `radial-gradient(${accent.glowShape}, ${accent.glow} 0%, rgba(0,0,0,0) 70%)`,
        }}
      />

      {/* 비네트 — 가장자리를 눌러 글자가 뜨게 한다 */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(1200px 1200px at 50% 45%, rgba(0,0,0,0) 40%, rgba(0,0,0,${accent.vignette}) 100%)`,
        }}
      />

      {/* 질감 */}
      <AbsoluteFill
        style={{
          opacity: texture.opacity,
          backgroundImage: texture.image,
          backgroundSize: texture.size,
          maskImage: mask,
          WebkitMaskImage: mask,
        }}
      />
    </AbsoluteFill>
  );
};
