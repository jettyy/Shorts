/**
 * 차트 전용 색·치수 토큰.
 *
 * 색 선택 근거 (dataviz 검증 스크립트로 확인):
 *  - 카테고리가 2개 이상 실제로 구분돼야 할 때만 SERIES 를 쓴다.
 *    남색 배경(#0E1D42) 기준으로 명도대역·채도·색각이상 분리도(ΔE)·대비를 모두 통과한 조합이다.
 *  - 기본 패턴은 "하나만 강조, 나머지는 회색". 4초짜리 화면에서 시선은 하나만 가야 한다.
 *    강조색은 영상의 accent(브랜드 색)를 그대로 쓴다.
 *  - 영상에는 마우스 오버가 없으므로 모든 수치는 화면에 직접 라벨로 찍는다.
 *    (색만으로 구분하지 않는다)
 */
export const SERIES = ['#3987E5', '#D95926', '#199E70'] as const;
// (현재 템플릿은 "하나만 강조" 패턴을 쓰므로 SERIES 는 예비용이다.
//  진짜로 2~3개 범주를 동등하게 구분해야 하는 도표를 추가할 때 이 순서대로 쓴다.)

/** 강조하지 않는 값(맥락용) */
export const CONTEXT = 'rgba(178, 191, 214, 0.55)';
export const CONTEXT_SOLID = '#8C9AB8';

/**
 * 강조 조각 외 나머지를 칠하는 무채색 단계.
 * 도넛처럼 조각이 여럿일 때 서로 다른 색상(hue)을 쓰면 시선이 분산되고,
 * accent 색과 비슷한 색이 섞이면 구분도 안 된다.
 * → 강조는 accent 하나, 나머지는 명도만 다른 회색 계열로 간다. 이름은 라벨이 알려준다.
 */
export const NEUTRAL_RAMP = ['#93A1BC', '#66738F', '#454F68'] as const;

/**
 * 겹치는 마크 둘레에 두르는 링 색 (배경색과 같은 계열).
 * 선과 점이 겹쳐도 점이 또렷하게 분리돼 보이게 한다.
 */
export const SURFACE_RING = '#0C1934';

/** 눈금·기준선은 뒤로 물러나야 한다 */
export const GRID = 'rgba(255, 255, 255, 0.10)';
export const AXIS = 'rgba(255, 255, 255, 0.22)';

/** 좋음/나쁨 상태색 — 카테고리 색으로 재사용하지 않는다 */
export const STATUS = {
  good: '#3FD6A8',
  bad: '#FF7A6B',
} as const;

export const CHART = {
  /** 막대 끝 둥글기 */
  barRadius: 10,
  barHeight: 68,
  barGap: 22,
  /** 꺾은선 두께 */
  lineWidth: 6,
  /** 데이터 점 지름 */
  dotSize: 20,
  labelSize: 34,
  valueSize: 44,
} as const;
