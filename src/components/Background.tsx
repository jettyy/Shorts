import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { BASE, type Accent } from '../theme';

/**
 * 영상 전체에 깔리는 남색 그라데이션 배경.
 * 카드 시퀀스 바깥에 한 번만 깔려서, 카드가 바뀌어도 배경은 끊기지 않고 천천히 흐른다.
 * 포인트 컬러(accent)에 따라 상단 색감이 달라진다.
 */
export const Background: React.FC<{ accent: Accent }> = ({ accent }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const drift = interpolate(frame, [0, Math.max(durationInFrames, 1)], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const glowY = interpolate(drift, [0, 1], [-60, 120]);
  const glowScale = interpolate(drift, [0, 1], [1, 1.18]);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${accent.bgTop} 0%, ${BASE.navy} 34%, ${BASE.navyDeep} 72%, ${BASE.navyDeepest} 100%)`,
      }}
    >
      <AbsoluteFill
        style={{
          transform: `translateY(${glowY}px) scale(${glowScale})`,
          background: `radial-gradient(760px 620px at 50% 18%, ${accent.glow} 0%, rgba(0,0,0,0) 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(1200px 1200px at 50% 45%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.45) 100%)',
        }}
      />
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
