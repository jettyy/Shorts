import { createContext, useContext } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from 'remotion';

/**
 * "등장 연출을 건너뛰고 완성된 상태로 그려라" 는 신호.
 *
 * 첫 카드는 0프레임부터 내용이 다 보여야 한다.
 * 유튜브·인스타가 영상의 첫 프레임을 커버(썸네일)로 잡아가기 때문에,
 * 글자가 아직 안 뜬 화면이 썸네일이 되면 곤란하다.
 */
export const InstantContext = createContext(false);

export const useInstant = () => useContext(InstantContext);

/**
 * 시각 자료가 순서대로 그려지는 느낌을 만드는 공통 훅.
 * delay 프레임만큼 기다렸다가 0 → 1 로 진행한다.
 */
export const useReveal = (delay = 0, durationInFrames = 18) => {
  const instant = useInstant();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const value = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200, mass: 0.6, stiffness: 120 },
    durationInFrames,
  });
  return instant ? 1 : value;
};

/** 선이 왼쪽에서 오른쪽으로 그려지는 식의 단순 진행도 */
export const useDraw = (delay = 0, length = 24) => {
  const instant = useInstant();
  const frame = useCurrentFrame();
  const value = interpolate(frame, [delay, delay + length], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  return instant ? 1 : value;
};
