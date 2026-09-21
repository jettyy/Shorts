/**
 * 화면에 찍히는 값 문자열에서 **크기**를 읽어낸다.
 *
 * 순위표의 막대(`barValue`)를 대본에 일일이 적게 하면 빠뜨리기 쉽고,
 * 빠지면 막대가 안 깔려서 순위가 그냥 글자 목록처럼 보인다.
 * 그래서 `value` 에서 숫자를 직접 읽어 막대 길이로 쓴다.
 *
 * ⚠️ 한국어 금액은 자리값이 곱셈으로 쌓인다 — "1억 847만 원" 은 1과 847이 아니라
 *    1×1억 + 847×1만 = 108,470,000 이다. 그냥 숫자만 긁으면 1 또는 847이 되어
 *    **막대 길이가 뒤집힌다.** 단위를 제대로 곱해야 한다.
 *
 * 같은 카드 안에서 일관되게만 계산되면 막대 비율은 맞는다.
 */

/** 큰 단위 — 큰 것부터 (조 → 억 → 만) */
const UNITS: [string, number][] = [
  ['조', 1e12],
  ['억', 1e8],
  ['만', 1e4],
];

const digits = (s: string) => Number(s.replace(/,/g, ''));

/**
 * @returns 크기(숫자). 숫자를 못 찾으면 null.
 *
 * 예) "1억 847만 원" → 108470000
 *     "9,900만 원"   → 99000000
 *     "4,109"        → 4109
 *     "23.5%"        → 23.5
 *     "약 1.2조 원"  → 1200000000000
 */
export const parseAmount = (value: string): number | null => {
  const text = String(value ?? '').trim();
  if (!text) return null;

  let total = 0;
  let matched = false;
  let rest = text;

  for (const [unit, mul] of UNITS) {
    // 단위 **바로 앞**에 붙은 숫자만 가져온다
    const m = new RegExp(`([\\d,]+(?:\\.\\d+)?)\\s*${unit}`).exec(rest);
    if (!m) continue;
    const n = digits(m[1]);
    if (!Number.isFinite(n)) continue;
    total += n * mul;
    matched = true;
    rest = rest.slice(m.index + m[0].length); // 쓴 부분은 잘라낸다
  }

  // 큰 단위 뒤에 남은 숫자 (예: "1억 5천" 의 5천은 아래에서 못 읽으니 무시된다)
  const tail = /([\d,]+(?:\.\d+)?)/.exec(rest);
  if (tail) {
    const n = digits(tail[1]);
    if (Number.isFinite(n)) {
      total += n;
      matched = true;
    }
  }

  return matched ? total : null;
};

/**
 * 순위 목록의 막대 길이를 정한다.
 *
 * `barValue` 를 직접 적었으면 그걸 쓰고, 없으면 `value` 에서 읽는다.
 * **한 줄이라도 못 읽으면 막대를 통째로 끈다** — 일부만 깔리면 크기를 잘못 읽게 된다.
 */
export const barValues = (items: { value: string; barValue?: number }[]): number[] | null => {
  const out = items.map((it) =>
    typeof it.barValue === 'number' && Number.isFinite(it.barValue)
      ? it.barValue
      : parseAmount(it.value),
  );
  return out.every((v) => v !== null && v > 0) ? (out as number[]) : null;
};
