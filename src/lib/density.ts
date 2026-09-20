import { LAYOUT } from '../theme';

/**
 * 도표 밀도 자동 조절.
 *
 * 왜 필요한가
 * ───────────
 * 도표 크기가 고정돼 있으면 항목 수에 따라 화면이 망가진다.
 * 항목이 3개면 휑하고, 20개면 카드 밖으로 넘쳐서 잘린다.
 * 그래서 "항목 수 4개 이하"라는 제약을 걸어뒀었는데,
 * 그 제약 때문에 순위表·목록처럼 **전부 보여줘야 핵심인 내용**을 담을 수 없었다.
 *
 * 제약을 없애는 대신, 도표가 스스로 항목 수에 맞춰 크기를 줄인다.
 *
 * 쓰는 법
 * ───────
 *   const d = fitDensity(items.length * (ROW + GAP) - GAP);
 *   fontSize: d.fs(40), padding: d.sp(22)
 *
 * 글자와 여백을 같은 비율로 줄인다(비율이 깨지면 디자인이 무너진다).
 * 대신 `floored` 가 참이면 더 줄일 수 없다는 뜻 —
 * 이때는 항목을 여러 카드로 나눠야 한다(`npm run check` 가 알려준다).
 */

/**
 * 도표가 쓸 수 있는 세로 공간(px).
 *
 * 1920 − 상단(108+90) − 하단(232+40) = 1450 이 본문 영역이다.
 * 가장 빡빡한 경우(제목 3줄 249 + 보조 설명 75 + 강조선 38 + 도표 위 여백 52 = 414)를
 * 빼면 1036 이 남는다. 실제로 렌더해 보니 이 값을 그대로 쓰면 마지막 행이
 * 하단 진행 바에 거의 닿아서, 여유를 두고 잡는다.
 */
export const VISUAL_BUDGET = 980;

/** 도표가 쓸 수 있는 가로 폭(px) */
export const VISUAL_WIDTH = LAYOUT.width - LAYOUT.paddingX * 2;

/**
 * 영상 안에서 읽을 수 있는 글자 크기의 하한(px).
 *
 * 1080 폭으로 만든 영상을 폰에서 보면 대략 400px 폭으로 줄어든다(≈0.37배).
 * 그래서 화면상 26px 이면 폰에서 약 10px — 이게 사실상 마지노선이다.
 * 이보다 작아질 만큼 항목이 많으면 **줄이지 말고 카드를 나눠야 한다.**
 */
export const MIN_FONT = 26;

export type Density = {
  /** 0~1. 1이면 설계 원본 크기 */
  scale: number;
  /** 글자 크기 변환 */
  fs: (px: number) => number;
  /** 여백·높이 변환 */
  sp: (px: number) => number;
  /** 더 줄일 수 없어서 넘칠 수 있는 상태 (항목을 카드로 나눠야 한다) */
  floored: boolean;
};

/**
 * 설계 원본 크기로 그렸을 때의 높이(naturalHeight)를 주면
 * 카드 안에 들어가도록 줄일 비율을 돌려준다.
 *
 * @param primaryFont 이 도표에서 **반드시 읽혀야 하는** 글자의 원본 크기.
 *   이 글자가 MIN_FONT 보다 작아지지 않는 선까지만 줄인다.
 */
export const fitDensity = (
  naturalHeight: number,
  primaryFont = 36,
  budget: number = VISUAL_BUDGET,
): Density => {
  const minScale = Math.min(1, MIN_FONT / primaryFont);
  const raw = naturalHeight <= 0 ? 1 : Math.min(1, budget / naturalHeight);
  const scale = Math.max(raw, minScale);
  return {
    scale,
    fs: (px) => Math.round(px * scale * 10) / 10,
    sp: (px) => Math.round(px * scale * 10) / 10,
    floored: raw < minScale,
  };
};

/**
 * 한 카드에 읽을 수 있는 크기로 담기는 최대 항목 수.
 * 대본 점검(`scripts/check-script.mjs`)에서 "몇 장으로 나눠라"를 계산할 때 쓴다.
 */
export const maxItemsFor = (
  perItemHeight: number,
  gap: number,
  primaryFont = 36,
  budget = VISUAL_BUDGET,
): number => {
  const minScale = Math.min(1, MIN_FONT / primaryFont);
  return Math.max(1, Math.floor((budget / minScale + gap) / (perItemHeight + gap)));
};
