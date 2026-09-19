import { interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from 'remotion';

/**
 * 시각 자료가 순서대로 그려지는 느낌을 만드는 공통 훅.
 * delay 프레임만큼 기다렸다가 0 → 1 로 진행한다.
 */
export const useReveal = (delay = 0, durationInFrames = 18) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({
    frame: frame - delay,
    fps,
    config: { damping: 200, mass: 0.6, stiffness: 120 },
    durationInFrames,
  });
};

/** 선이 왼쪽에서 오른쪽으로 그려지는 식의 단순 진행도 */
export const useDraw = (delay = 0, length = 24) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [delay, delay + length], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
};
