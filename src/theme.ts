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

/**
 * 배경 질감.
 * 색만 바꾸면 화면의 70%를 차지하는 배경이 결국 똑같아 보인다.
 * 그래서 테마마다 결(패턴) 자체를 다르게 둔다.
 */
export type Texture = 'grid' | 'diagonal' | 'dots' | 'rings' | 'scanline';

export type Accent = {
  /** 기본 포인트 색 */
  primary: string;
  /** 밝은 강조 (텍스트용) */
  bright: string;
  /** 테두리·배경용 반투명 */
  soft: string;
  /** 배경 글로우 */
  glow: string;
  /** 배경 그라데이션 최상단 색 (= bg[0], 미리보기용) */
  bgTop: string;
  /**
   * 배경 그라데이션 전체.
   * 예전에는 최상단 색만 테마별로 바꾸고 아래 세 단계는 전부 같은 남색을 썼다.
   * 그래서 어떤 테마를 골라도 화면 대부분이 똑같은 남색이었다.
   * 이제는 네 단계 전부와 각도까지 테마가 가진다.
   */
  bgAngle: number;
  bg: [string, string, string, string];
  /** 글로우의 위치·크기 (radial-gradient 앞부분) */
  glowShape: string;
  /** 배경 질감 */
  texture: Texture;
  /** 질감·글로우가 모이는 중심 (mask 중심) */
  focus: [string, string];
  /** 비네트(가장자리 어둡게) 세기 0~1 */
  vignette: number;
  /**
   * 도표에서 겹치는 마크 둘레에 두르는 링 색.
   * 배경 중간 톤과 같아야 점이 또렷하게 떨어진다 → 테마마다 다르다.
   */
  surface: string;
};

/**
 * 테마 5종.
 * 주제가 바뀌면 화면 분위기가 "확" 달라져야 같은 채널이라도 양산형으로 안 읽힌다.
 * 각 테마는 ① 색상 계열 ② 그라데이션 방향 ③ 빛이 들어오는 위치 ④ 배경 질감
 * 네 가지를 모두 다르게 가진다.
 *
 * 배경은 전부 충분히 어두워서(상대휘도 0.06 이하) 흰 제목의 대비는 어떤 테마에서도 12:1 위다.
 */
export const ACCENTS: Record<AccentKey, Accent> = {
  /** 돈·혜택 — 깊은 남색 위 금빛. 위에서 빛이 내려온다. 격자. */
  gold: {
    primary: '#E8B44A',
    bright: '#FFD874',
    soft: 'rgba(232, 180, 74, 0.28)',
    glow: 'rgba(232, 180, 74, 0.16)',
    bgTop: '#2A3D78',
    bgAngle: 160,
    bg: ['#2A3D78', '#122350', '#071026', '#03060F'],
    glowShape: '820px 640px at 50% 14%',
    texture: 'grid',
    focus: ['50%', '36%'],
    vignette: 0.45,
    surface: '#0C1934',
  },
  /** 안내·절차 — 짙은 청록(숲). 빛이 왼쪽 아래에서 올라온다. 사선. */
  mint: {
    primary: '#3FD6A8',
    bright: '#7FF0C9',
    soft: 'rgba(63, 214, 168, 0.26)',
    glow: 'rgba(63, 214, 168, 0.17)',
    bgTop: '#0B4A46',
    bgAngle: 200,
    bg: ['#0B4A46', '#052B28', '#041D1D', '#01090A'],
    glowShape: '900px 760px at 16% 78%',
    texture: 'diagonal',
    focus: ['28%', '62%'],
    vignette: 0.5,
    surface: '#072523',
  },
  /** 경고·마감 — 자줏빛 적갈. 빛이 오른쪽 위에서 비친다. 점무늬. */
  coral: {
    primary: '#FF7A6B',
    bright: '#FFA495',
    soft: 'rgba(255, 122, 107, 0.26)',
    glow: 'rgba(255, 122, 107, 0.16)',
    bgTop: '#5A1830',
    bgAngle: 135,
    bg: ['#5A1830', '#3A1027', '#1D0816', '#0A0208'],
    glowShape: '780px 700px at 84% 24%',
    texture: 'dots',
    focus: ['66%', '34%'],
    vignette: 0.52,
    surface: '#2A0D1C',
  },
  /** 분석·비교 — 진한 보라. 빛이 아래 가운데에서 퍼진다. 동심원. */
  violet: {
    primary: '#A88BFF',
    bright: '#C9B6FF',
    soft: 'rgba(168, 139, 255, 0.26)',
    glow: 'rgba(168, 139, 255, 0.18)',
    bgTop: '#3B1C72',
    bgAngle: 190,
    bg: ['#3B1C72', '#241350', '#120A2C', '#050211'],
    glowShape: '960px 820px at 50% 86%',
    texture: 'rings',
    focus: ['50%', '52%'],
    vignette: 0.48,
    surface: '#1A0F3A',
  },
  /**
   * 통계·동향 — 무채색 강철(그래파이트). 빛이 왼쪽 위 모서리. 가로 주사선.
   * 배경에서 색을 빼서, 같은 파랑 계열인 gold(남색)와 확실히 갈라진다.
   * 배경이 회색이라 시안 포인트가 가장 세게 튄다.
   */
  ice: {
    primary: '#5FB9FF',
    bright: '#9AD5FF',
    soft: 'rgba(95, 185, 255, 0.26)',
    glow: 'rgba(95, 185, 255, 0.18)',
    bgTop: '#33475A',
    bgAngle: 145,
    bg: ['#33475A', '#1C2833', '#0D141B', '#020508'],
    glowShape: '840px 680px at 16% 16%',
    texture: 'scanline',
    focus: ['34%', '32%'],
    vignette: 0.55,
    surface: '#111A22',
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
