/**
 * 연출 설정 (`config/style.json`) 읽기 — 서버용.
 *
 * 렌더러 쪽은 `src/lib/style.ts` 가 같은 파일을 읽는다.
 * **두 곳의 기본값을 다르게 두지 않는다.** 다르면 화면과 소리가 어긋난다.
 *
 * 서버는 매번 파일에서 다시 읽는다 — 설정을 고치고 서버를 껐다 켤 필요가 없게.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG_PATH = resolve(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'config', 'style.json'),
);

export const STYLE_DEFAULTS = {
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
      duckDb: -9,
    },
  },
};

/** 빠진 항목만 기본값으로 채운다 (주석 키 `_` 와 모르는 키는 무시) */
const merge = (base, over) => {
  if (over === null || typeof over !== 'object' || Array.isArray(over)) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (k.startsWith('_') || !(k in out)) continue;
    const cur = out[k];
    out[k] = cur !== null && typeof cur === 'object' && !Array.isArray(cur) ? merge(cur, v) : v;
  }
  return out;
};

export const loadStyle = () => {
  if (!existsSync(CONFIG_PATH)) return STYLE_DEFAULTS;
  try {
    return merge(STYLE_DEFAULTS, JSON.parse(readFileSync(CONFIG_PATH, 'utf8')));
  } catch (e) {
    // 설정이 깨져도 영상은 만들 수 있어야 한다
    console.warn(`[설정] config/style.json 을 읽지 못해 기본값을 씁니다 — ${e.message}`);
    return STYLE_DEFAULTS;
  }
};
