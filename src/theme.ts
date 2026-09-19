import type { AccentKey } from './types';

/**
 * 카드뉴스 쇼츠 디자인 토큰.
 *
 * accent(포인트 컬러)는 영상마다 바꿀 수 있다.
 * 모든 영상이 똑같은 색·구성으로 보이면 '양산형 채널'로 읽히기 쉬워서,
 * 주제별로 톤을 달리 가져갈 수 있게 5종을 준비했다.
 */

export const BASE = {
  navyDeepest: '#03060F',
  navyDeep: '#071026',
  navy: '#0E1D42',
  navyLight: '#1B2F63',

  white: '#FFFFFF',
  textMuted: 'rgba(255, 255, 255, 0.62)',
  textDim: 'rgba(255, 255, 255, 0.38)',
  line: 'rgba(255, 255, 255, 0.12)',
} as const;

export type Accent = {
  /** 기본 포인트 색 */
  primary: string;
  /** 밝은 강조 (텍스트용) */
  bright: string;
  /** 테두리·배경용 반투명 */
  soft: string;
  /** 배경 글로우 */
  glow: string;
  /** 배경 그라데이션 최상단 색 */
  bgTop: string;
};

export const ACCENTS: Record<AccentKey, Accent> = {
  gold: {
    primary: '#E8B44A',
    bright: '#FFD874',
    soft: 'rgba(232, 180, 74, 0.28)',
    glow: 'rgba(232, 180, 74, 0.14)',
    bgTop: '#1B2F63',
  },
  mint: {
    primary: '#3FD6A8',
    bright: '#7FF0C9',
    soft: 'rgba(63, 214, 168, 0.26)',
    glow: 'rgba(63, 214, 168, 0.13)',
    bgTop: '#143A52',
  },
  coral: {
    primary: '#FF7A6B',
    bright: '#FFA495',
    soft: 'rgba(255, 122, 107, 0.26)',
    glow: 'rgba(255, 122, 107, 0.13)',
    bgTop: '#2C2452',
  },
  violet: {
    primary: '#A88BFF',
    bright: '#C9B6FF',
    soft: 'rgba(168, 139, 255, 0.26)',
    glow: 'rgba(168, 139, 255, 0.14)',
    bgTop: '#241C4D',
  },
  ice: {
    primary: '#5FB9FF',
    bright: '#9AD5FF',
    soft: 'rgba(95, 185, 255, 0.26)',
    glow: 'rgba(95, 185, 255, 0.13)',
    bgTop: '#10315C',
  },
};

export const getAccent = (key?: AccentKey): Accent => ACCENTS[key ?? 'gold'] ?? ACCENTS.gold;

export const LAYOUT = {
  width: 1080,
  height: 1920,
  fps: 30,
  paddingX: 84,
  paddingTop: 108,
  /**
   * 하단 여백. 유튜브 쇼츠/릴스는 화면 아래쪽 약 300px을 제목·계정명 UI가 덮으므로
   * 중요한 요소는 이 선 위로 올린다.
   */
  paddingBottom: 232,
} as const;

/** 본문이 실제로 쓸 수 있는 가로 폭 */
export const CONTENT_WIDTH = LAYOUT.width - LAYOUT.paddingX * 2;

export const FONT_FAMILY = 'Pretendard, "Noto Sans KR", system-ui, sans-serif';

export const TYPE = {
  titleMax: 96,
  titleMin: 46,
  hookTitleMax: 118,
  hookTitleMin: 56,
  /** 시각 자료가 같이 들어가는 카드는 제목을 작게 — 자료가 주인공이다 */
  titleWithVisualMax: 66,
  kicker: 34,
  indexBadge: 30,
  body: 38,
} as const;

/** 카드 역할별 기본 라벨 (kicker를 안 줬을 때 쓰이지 않고, 배지 용도) */
export const TYPE_LABEL: Record<string, string> = {
  hook: '',
  fact: '확인된 사실',
  condition: '대상·조건',
  example: '직접 계산',
  caveat: '주의할 점',
  conclusion: '결론',
};
