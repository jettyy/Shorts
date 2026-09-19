/** script.json 한 장(카드)의 데이터 구조 */
export type Card = {
  /** 카드 번호(1부터). 생략하면 배열 순서로 자동 부여 */
  index?: number;
  /** 상단 작은 라벨. 예: "몰라서 못 받는 돈" (선택) */
  kicker?: string;
  /** 화면 중앙 큰 텍스트. \n 으로 직접 줄바꿈 지정 가능, 최대 3줄 */
  title: string;
  /** 첫 카드(훅) 여부 - 폰트가 더 커진다 */
  isHook?: boolean;
  /** 마지막 카드(CTA) 여부 - 텍스트가 골드 계열로 강조된다 */
  isCta?: boolean;
  /** 이 카드가 화면에 머무는 시간(초) */
  durationSec: number;
};

/** src/script.json 전체 구조 */
export type ScriptData = {
  /** 영상 주제(파일명/메모용, 화면에는 나오지 않음) */
  topic?: string;
  /** 원문 출처 메모 (선택) */
  source?: string;
  cards: Card[];
};
