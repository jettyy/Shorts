import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS } from '../theme';

/**
 * 영상 전체에 깔리는 남색 그라데이션 배경.
 * 카드 시퀀스 바깥에 한 번만 깔려서, 카드가 바뀌어도 배경은 끊기지 않고 천천히 흐른다.
 */
export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // 전체 길이에 걸쳐 아주 느리게 움직이는 골드 글로우 (지루함 방지)
  const drift = interpolate(frame, [0, Math.max(durationInFrames, 1)], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const glowY = interpolate(drift, [0, 1], [-60, 120]);
  const glowScale = interpolate(drift, [0, 1], [1, 1.18]);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${COLORS.navyLight} 0%, ${COLORS.navy} 34%, ${COLORS.navyDeep} 72%, ${COLORS.navyDeepest} 100%)`,
      }}
    >
      {/* 상단 골드 글로우 */}
      <AbsoluteFill
        style={{
          transform: `translateY(${glowY}px) scale(${glowScale})`,
          background: `radial-gradient(760px 620px at 50% 18%, ${COLORS.goldGlow} 0%, rgba(232,180,74,0) 70%)`,
        }}
      />
      {/* 하단을 눌러주는 비네트 — 텍스트 대비 확보 */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(1200px 1200px at 50% 45%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.45) 100%)',
        }}
      />
      {/* 아주 옅은 격자 — 평평한 단색 배경 티를 없앤다 */}
      <AbsoluteFill
        style={{
          opacity: 0.05,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '120px 120px',
          maskImage: 'radial-gradient(900px 900px at 50% 40%, black 0%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(900px 900px at 50% 40%, black 0%, transparent 75%)',
        }}
      />
    </AbsoluteFill>
  );
};
