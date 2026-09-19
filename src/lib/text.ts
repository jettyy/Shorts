import { CONTENT_WIDTH, TYPE } from '../theme';

/**
 * 한글 기준 글자 폭 가중치.
 * Pretendard에서 한글/한자/가나는 거의 1em, 영문/숫자는 약 0.55em, 공백은 0.3em.
 */
const charWidth = (ch: string): number => {
  const code = ch.codePointAt(0) ?? 0;
  if (ch === ' ') return 0.3;
  // 한글 음절/자모, CJK 한자, 가나, 전각 문장부호
  if (
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x3130 && code <= 0x318f) ||
    (code >= 0x3040 && code <= 0x30ff) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xff00 && code <= 0xff60)
  ) {
    return 1;
  }
  if (/[.,!?'"·:;()\[\]]/.test(ch)) return 0.34;
  if (/[iIljt1!|]/.test(ch)) return 0.32;
  return 0.56;
};

/** 문자열의 시각적 폭을 em 단위로 추정 */
export const measureEm = (line: string): number =>
  [...line].reduce((sum, ch) => sum + charWidth(ch), 0);

/**
 * 제목을 읽기 좋은 줄로 나눈다.
 * - 원문에 \n 이 있으면 그 줄바꿈을 그대로 존중한다(작성자 의도 우선).
 * - 없으면 어절(띄어쓰기) 단위로 maxEm 폭에 맞춰 줄을 만든다.
 */
export const wrapTitle = (title: string, maxEm = 15): string[] => {
  const manual = title.split('\n').map((l) => l.trim()).filter(Boolean);
  if (manual.length > 1) return manual;

  const words = (manual[0] ?? '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measureEm(candidate) > maxEm) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
};

/**
 * 줄 목록이 가로 폭 안에 들어오도록 폰트 크기를 계산한다.
 * 줄 수가 많아질수록 살짝 더 줄여서 세로로도 안정적으로 앉게 한다.
 */
export const fitFontSize = (lines: string[], isHook: boolean): number => {
  const max = isHook ? TYPE.hookTitleMax : TYPE.titleMax;
  const min = isHook ? TYPE.hookTitleMin : TYPE.titleMin;
  const widest = Math.max(...lines.map(measureEm), 1);
  const byWidth = CONTENT_WIDTH / widest;
  const lineCountPenalty = lines.length >= 3 ? 0.9 : lines.length === 2 ? 0.97 : 1;
  return Math.max(min, Math.min(max, byWidth * lineCountPenalty));
};
