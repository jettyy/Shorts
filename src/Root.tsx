import React from 'react';
import { Composition } from 'remotion';
import './fonts';
import { CardNews, totalFrames } from './components/CardNews';
import { LAYOUT } from './theme';
import type { ScriptData } from './types';
import scriptJson from './script.json';

const script = scriptJson as ScriptData;

/**
 * 컴포지션 등록.
 * 영상 길이는 src/script.json 의 durationSec 합계에서 자동으로 계산된다.
 * → 새 주제로 만들 때 script.json 만 갈아끼우면 끝.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="CardNews"
      component={CardNews}
      width={LAYOUT.width}
      height={LAYOUT.height}
      fps={LAYOUT.fps}
      durationInFrames={Math.max(totalFrames(script), LAYOUT.fps)}
      defaultProps={{ script }}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(totalFrames(props.script ?? script), LAYOUT.fps),
      })}
    />
  );
};
