/**
 * 연출 설정 (`config/style.json`) 읽기.
 *
 * 훅 문구 형태·모션·순위 공개 순서·오디오 값을 **코드가 아니라 설정 파일**에서
 * 바꿀 수 있게 한 곳에 모았다. 설정 파일이 비어 있거나 항목이 빠져도
 * 아래 기본값으로 돌아가므로, 예전 설정 파일도 그대로 읽힌다.
 *
 * ⚠️ 렌더러(src/)와 서버(app/)가 같은 파일을 본다.
 *    서버 쪽은 `app/style-config.mjs` 가 같은 기본값으로 읽는다 —
 *    **두 곳의 기본값을 다르게 두지 않는다.**
 */
import raw from '../../config/style.json' with { type: 'json' };

/** 훅(1번 카드) 문구를 어떤 형태로 뽑을지 */
export type HookStyle =
  /** 결론·숫자를 먼저 깐다 — "1위 1,128만 원, 어디일까" */
  | 'number-first'
  /** 직관적 비교 — "4년이면 중형차 한 대 값" */
  | 'comparison'
  /** 손해·오해를 찌른다 — "적금에 묶어두면 손해 보는 이유" */
  | 'provocative'
  /** 예전 방식(질문형) — "적금 2.8%가 아쉽다면?" */
  | 'question';

/** 제목을 어떻게 등장시킬지 */
export type TitleReveal = 'line' | 'word';

/** 순위를 어떤 순서로 공개할지 */
export type RankReveal =
  /** 20위 → 1위 (기본) */
  | 'bottom-up'
  /** 1위를 먼저 보여주고 나머지를 잇는다 */
  | 'winner-first'
  /** 3위 → 2위 → 1위 (짧은 목록용) */
  | 'countdown';

export type StyleConfig = {
  hook: { style: HookStyle };
  motion: {
    titleReveal: TitleReveal;
    wordStaggerFrames: number;
    emphasis: {
      enabled: boolean;
      /** 강조 글자를 몇 배로 키울지 (1 = 안 키움) */
      scale: number;
      /** 튕기며 등장할지 */
      bounce: boolean;
      /** 테마 색 중 어느 것을 쓸지 */
      color: 'bright' | 'primary' | 'soft';
    };
  };
  rank: { reveal: RankReveal };
  audio: {
    speed: number;
    gapSec: number;
    bgm: {
      enabled: boolean;
      /** public/audio/ 기준 파일 이름 */
      track: string;
      /** 배경음악 기본 음량(dB). 0 이 원본 */
      gainDb: number;
      /** 목소리가 나올 때 더 줄일 양(dB) */
      duckDb: number;
      duckAttackMs: number;
      duckReleaseMs: number;
    };
  };
};

export const STYLE_DEFAULTS: StyleConfig = {
  hook: { style: 'number-first' },
  motion: {
    titleReveal: 'word',
    wordStaggerFrames: 2,
    emphasis: { enabled: true, scale: 1.16, bounce: true, color: 'bright' },
  },
  rank: { reveal: 'bottom-up' },
  audio: {
    speed: 1.1,
    gapSec: 0.4,
    bgm: {
      enabled: false,
      track: '',
      gainDb: -20,
      duckDb: -8,
      duckAttackMs: 20,
      duckReleaseMs: 350,
    },
  },
};

/** 빠진 항목만 기본값으로 채운다 (있는 값은 그대로 둔다) */
const merge = <T,>(base: T, over: unknown): T => {
  if (over === null || typeof over !== 'object' || Array.isArray(over)) return base;
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    if (k.startsWith('_') || !(k in out)) continue; // 주석 키(_)와 모르는 키는 무시
    const cur = out[k];
    out[k] =
      cur !== null && typeof cur === 'object' && !Array.isArray(cur) ? merge(cur, v) : v;
  }
  return out as T;
};

export const STYLE: StyleConfig = merge(STYLE_DEFAULTS, raw);
