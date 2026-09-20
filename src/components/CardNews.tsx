import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { Background } from './Background';
import { Card } from './Card';
import { ProgressBar } from './ProgressBar';
import { getAccent, LAYOUT } from '../theme';
import type { ScriptData } from '../types';

export type CardNewsProps = {
  script: ScriptData;
};

/**
 * 카드가 교체될 때 겹치는 길이(프레임).
 * 다음 카드를 이만큼 먼저 띄워서, 앞 카드가 위로 빠지는 동안 아래에서 올라오게 한다.
 * (이게 없으면 카드가 바뀌는 순간 배경만 남는 빈 프레임이 생긴다)
 */
export const OVERLAP = 5;

/** durationSec → 프레임. 최소 1초는 보장한다. */
export const toFrames = (sec: number): number =>
  Math.max(Math.round((Number(sec) || 0) * LAYOUT.fps), LAYOUT.fps);

/** script.json 전체 길이(프레임) */
export const totalFrames = (script: ScriptData): number =>
  (script.cards ?? []).reduce((sum, c) => sum + toFrames(c.durationSec), 0);

/**
 * 카드들을 순서대로 이어붙이는 컴포지션.
 * 카드 개수/텍스트/도표/타이밍만 바뀌면 그대로 새 영상이 되는 재사용 템플릿.
 */
export const CardNews: React.FC<CardNewsProps> = ({ script }) => {
  const cards = script.cards ?? [];
  const segments = cards.map((c) => toFrames(c.durationSec));
  const accent = getAccent(script.accent);

  let cursor = 0;
  return (
    <AbsoluteFill>
      <Background accent={accent} />

      {/* 직접 녹음한 내레이션이 있으면 깔아준다 (public/ 기준 경로) */}
      {script.narrationAudio ? <Audio src={staticFile(script.narrationAudio)} /> : null}

      {cards.map((card, i) => {
        const start = cursor;
        const duration = segments[i];
        cursor += duration;

        // 첫 카드를 뺀 나머지는 조금 일찍 등장시켜 앞 카드와 겹친다.
        const from = i === 0 ? start : start - OVERLAP;
        const length = i === 0 ? duration : duration + OVERLAP;

        return (
          <Sequence key={i} from={from} durationInFrames={length} name={`${i + 1}. ${card.type}`}>
            <Card
              card={card}
              index={card.index ?? i + 1}
              total={cards.length}
              accent={accent}
              source={script.source}
              isFirst={i === 0}
            />
          </Sequence>
        );
      })}

      <ProgressBar segments={segments} accent={accent} />
    </AbsoluteFill>
  );
};
