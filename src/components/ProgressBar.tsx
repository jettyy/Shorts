import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, LAYOUT } from '../theme';

type Props = {
  /** 각 카드의 길이(프레임). 카드 단위로 칸이 나뉜다 */
  segments: number[];
};

/**
 * 하단 진행 바. 카드 개수만큼 칸이 나뉘고, 현재 카드 칸이 골드로 차오른다.
 * 카드 시퀀스 바깥(전체 타임라인)에 있어서 카드가 바뀌어도 끊기지 않는다.
 */
export const ProgressBar: React.FC<Props> = ({ segments }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  let elapsed = 0;
  return (
    <div
      style={{
        position: 'absolute',
        left: LAYOUT.paddingX,
        right: LAYOUT.paddingX,
        bottom: LAYOUT.paddingBottom,
        display: 'flex',
        gap: 10,
      }}
    >
      {segments.map((len, i) => {
        const start = elapsed;
        elapsed += len;
        const local = Math.min(Math.max((frame - start) / Math.max(len, 1), 0), 1);
        return (
          <div
            key={i}
            style={{
              flex: len / Math.max(durationInFrames, 1),
              height: 8,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.12)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${local * 100}%`,
                height: '100%',
                background: `linear-gradient(90deg, ${COLORS.gold}, ${COLORS.goldBright})`,
                boxShadow: local > 0 ? `0 0 14px ${COLORS.goldSoft}` : 'none',
              }}
            />
          </div>
        );
      })}
    </div>
  );
};
