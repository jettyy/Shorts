/**
 * script.json 타입 정의.
 *
 * ⚠️ 설계 의도 (중요)
 * 이 스키마는 "기사 요약 자막 카드"를 만들기 어렵게, 그리고
 * "직접 조사·해설한 정보 영상"을 만들기 쉽게 설계돼 있다.
 * 유튜브는 '해설·교육적 가치가 거의 없는 이미지 슬라이드쇼/스크롤 텍스트'를
 * 수익화 불가 사례로 명시하고 있어서, 아래 필드들이 사실상 필수다.
 *   - narration   : 직접 읽을 내레이션 (카드마다 필수)
 *   - origin      : 이 카드가 '원문 사실'인지 '제작자 분석'인지
 *   - visual      : 글자 말고 실제 시각 자료 (표/계산/체크리스트 등)
 *   - source      : 출처와 확인 기준일
 */

/** 카드의 역할. 역할에 따라 화면 구성이 달라진다. */
export type CardType =
  | 'hook' // 1장: 구체적인 질문/사실 기반 훅
  | 'fact' // 원문에서 확인한 핵심 사실
  | 'condition' // 대상자·조건 정리
  | 'example' // 직접 계산한 사례
  | 'caveat' // 원문에 안 나온 예외·주의점
  | 'conclusion'; // 제작자의 결론 / 실전 행동 순서

/**
 * 이 카드 내용의 출처.
 * - 'source'  : 원문에서 확인한 사실 (문장을 그대로 베끼지 않고 재서술)
 * - 'creator' : 제작자가 직접 분석·계산·검증한 내용
 */
export type CardOrigin = 'source' | 'creator';

/* ────────────────────────────────────────────────────────────
 * 시각 자료(Visual) 타입
 * 글자만 넘기는 카드가 아니라, 카드마다 실제 도표·그래프가 들어간다.
 * 영상이라 마우스 오버가 없으므로 모든 값은 화면에 직접 라벨로 찍는다.
 * ──────────────────────────────────────────────────────────── */

/** 핵심 숫자 하나를 크게 (hero number) */
export type StatVisual = {
  kind: 'stat';
  value: string;
  unit?: string;
  caption?: string;
  /** 증감 표시 (선택) */
  delta?: { text: string; dir: 'up' | 'down' };
};

/** 가로 막대그래프 — 크기 비교용. 세로 화면에서 라벨이 잘 붙는다 */
export type BarVisual = {
  kind: 'bar';
  unit?: string;
  items: { label: string; value: number; note?: string; highlight?: boolean }[];
};

/** 꺾은선 그래프 — 시간에 따른 변화 */
export type TrendVisual = {
  kind: 'trend';
  unit?: string;
  points: { label: string; value: number }[];
  /** 마지막 점을 강조할지 (기본 true) */
  highlightLast?: boolean;
};

/** 도넛 그래프 — 전체 중 비중 */
export type DonutVisual = {
  kind: 'donut';
  slices: { label: string; value: number; highlight?: boolean }[];
  centerLabel?: string;
};

/** 관계 도표 — 단계/흐름/인과관계를 화살표로 연결 */
export type FlowVisual = {
  kind: 'flow';
  direction?: 'down' | 'right';
  nodes: { label: string; note?: string; highlight?: boolean }[];
};

/** 직접 계산한 내역 (합계 강조) */
export type CalcVisual = {
  kind: 'calc';
  lines: { label: string; value: string }[];
  result: { label: string; value: string };
};

/** 해당/비해당 체크리스트 — 대상자 조건 정리용 */
export type ChecklistVisual = {
  kind: 'checklist';
  items: { text: string; ok: boolean }[];
};

/** 2열 비교표 */
export type TableVisual = {
  kind: 'table';
  headers: [string, string];
  rows: { label: string; a: string; b: string }[];
  /** 강조할 열 (0 또는 1) */
  highlightCol?: 0 | 1;
};

/** 시점별 타임라인 */
export type TimelineVisual = {
  kind: 'timeline';
  items: { when: string; label: string; highlight?: boolean }[];
};

/**
 * 순위 목록 — TOP N, 랭킹, 순위표.
 *
 * 원문이 "1위부터 20위까지"인데 상위 몇 개만 보여주면 핵심이 빠진다.
 * 순위는 **끝까지 보여주는 것 자체가 콘텐츠**라서, 항목 수 제한을 두지 않는다.
 * 대신 항목이 많으면 글자·행 높이가 자동으로 줄고(`lib/density.ts`),
 * 한 카드에 다 못 넣을 만큼 많으면 여러 카드로 나눠 이어 보여준다.
 */
export type RankListVisual = {
  kind: 'ranklist';
  /** 값 뒤에 붙는 단위 (예: "만 원"). value 에 이미 단위가 있으면 생략 */
  unit?: string;
  items: {
    /** 순위. 생략하면 배열 순서대로 1,2,3… (나눠 실을 땐 직접 지정) */
    rank?: number;
    label: string;
    /** 화면에 그대로 찍히는 값 (예: "1억 847만 원") */
    value: string;
    /** 막대 길이용 숫자값 (선택). 있으면 값 뒤에 크기 막대가 깔린다 */
    barValue?: number;
    /** accent 색으로 강조할 행 (한 장에 하나만) */
    highlight?: boolean;
  }[];
  /** 전체 순위 개수 (예: 20). 주면 "20위 중" 같은 안내가 붙는다 */
  totalRanks?: number;
};

export type Visual =
  | StatVisual
  | BarVisual
  | TrendVisual
  | DonutVisual
  | FlowVisual
  | CalcVisual
  | ChecklistVisual
  | TableVisual
  | TimelineVisual
  | RankListVisual;

export type Card = {
  /** 카드 번호(1부터). 생략하면 배열 순서로 자동 부여 */
  index?: number;
  /** 카드의 역할 */
  type: CardType;
  /** 원문 사실인지 제작자 분석인지 — 화면에 배지로 표시된다 */
  origin: CardOrigin;
  /** 상단 작은 라벨 (선택, 8자 이내) */
  kicker?: string;
  /** 화면 큰 텍스트. \n 으로 줄바꿈, 최대 3줄 */
  title: string;
  /** 제목 아래 보조 설명 한 줄 (선택) */
  body?: string;
  /** 글자 말고 실제로 보여줄 시각 자료 (선택이지만 최소 2장에는 필수) */
  visual?: Visual;
  /** 이 카드에서 직접 읽을 내레이션 — 전 카드 필수 */
  narration: string;
  /** 화면에 머무는 시간(초) */
  durationSec: number;
  /** 마지막 카드에만: 결론 아래 짧게 붙는 CTA 문구 */
  cta?: string;
};

/** 출처 표기 — 마지막 카드 하단과 내레이션 대본에 들어간다 */
export type SourceInfo = {
  title: string;
  publisher?: string;
  url: string;
  /** 정보 확인 기준일 (YYYY-MM-DD). 제도·요율은 바뀌므로 반드시 표기 */
  checkedOn: string;
};

/** 영상별 색 테마 키 — 주제마다 바꿔서 영상끼리 구분되게 한다 */
export type AccentKey = 'gold' | 'mint' | 'coral' | 'violet' | 'ice';

/** 플랫폼별 업로드 문구 */
export type PublishCopy = {
  youtube?: { title?: string; description?: string; tags?: string[] };
  instagram?: { caption?: string };
  threads?: { text?: string };
};

export type ScriptData = {
  topic: string;
  source: SourceInfo;
  /** 생략하면 'gold' */
  accent?: AccentKey;
  /**
   * 직접 녹음한 내레이션 오디오 파일. public/ 기준 상대 경로.
   * 예: "audio/20260919.mp3" → public/audio/20260919.mp3
   */
  narrationAudio?: string;
  /** 업로드용 문구 (없으면 서버가 대본에서 자동으로 만든다) */
  publish?: PublishCopy;
  cards: Card[];
};
