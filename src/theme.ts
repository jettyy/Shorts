/**
 * 카드뉴스 쇼츠 디자인 토큰.
 * 색/여백/타이포 스케일을 여기서만 바꾸면 전체 템플릿 톤이 한 번에 바뀐다.
 */
export const COLORS = {
  navyDeepest: '#03060F',
  navyDeep: '#071026',
  navy: '#0E1D42',
  navyLight: '#1B2F63',

  gold: '#E8B44A',
  goldBright: '#FFD874',
  goldSoft: 'rgba(232, 180, 74, 0.28)',
  goldGlow: 'rgba(232, 180, 74, 0.14)',

  white: '#FFFFFF',
  textMuted: 'rgba(255, 255, 255, 0.62)',
  textDim: 'rgba(255, 255, 255, 0.38)',
} as const;

export const LAYOUT = {
  width: 1080,
  height: 1920,
  fps: 30,
  /** 좌우 안전 여백 */
  paddingX: 84,
  /** 상단 바(카드 번호/키커) 위치 */
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
  /** 일반 카드 제목 최대/최소 크기 */
  titleMax: 104,
  titleMin: 52,
  /** 훅(1번 카드) 제목 최대/최소 크기 */
  hookTitleMax: 124,
  hookTitleMin: 60,
  kicker: 34,
  indexBadge: 30,
} as const;
