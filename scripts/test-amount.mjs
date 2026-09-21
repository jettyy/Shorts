/**
 * node scripts/test-amount.mjs
 *
 * 값 문자열에서 크기를 제대로 읽는지 본다 — 순위표 막대 길이에 쓰인다.
 *
 * 한국어 금액은 자리값이 곱셈으로 쌓인다. "1억 847만 원" 에서 숫자만 긁으면
 * 1 이나 847 이 나와서 **막대 길이가 뒤집힌다.** 그래서 단위를 곱해 읽는다.
 */
import { barValues, parseAmount } from '../src/lib/amount.ts';

let failed = 0;
const check = (ok, text) => {
  console.log(`  ${ok ? '✅' : '❌'} ${text}`);
  if (!ok) failed++;
};
const eq = (input, want) => {
  const got = parseAmount(input);
  check(got === want, `${JSON.stringify(input)} → ${got?.toLocaleString() ?? 'null'}`);
};

console.log('\n금액 읽기');
eq('1억 847만 원', 108_470_000);
eq('1억 609만 원', 106_090_000);
eq('9,900만 원', 99_000_000);
eq('959만 원', 9_590_000);
eq('1,128만 원', 11_280_000);
eq('약 1.2조 원', 1_200_000_000_000);

console.log('\n그 밖의 값');
eq('4,109', 4109);
eq('23.5%', 23.5);
eq('12명', 12);
eq('-', null);
eq('', null);
eq('미공개', null);

console.log('\n순위가 뒤집히지 않는가 (가장 중요)');
const rows = [
  { value: '1억 847만 원' },
  { value: '1억 609만 원' },
  { value: '9,900만 원' },
  { value: '959만 원' },
];
const bars = barValues(rows);
check(bars !== null, '전부 읽어냈다');
check(
  bars.every((v, i) => i === 0 || v <= bars[i - 1]),
  `순위 순서대로 값이 작아진다 — ${bars?.map((v) => v.toLocaleString()).join(' > ')}`,
);
check(
  bars[0] > bars[2],
  '"1억 847만" 이 "9,900만" 보다 크다 (숫자만 긁으면 847 < 9900 으로 뒤집힌다)',
);

console.log('\n직접 적은 barValue 가 우선');
check(
  barValues([{ value: '아무거나', barValue: 50 }, { value: '10' }])?.[0] === 50,
  'barValue 를 적었으면 그걸 쓴다',
);

console.log('\n하나라도 못 읽으면 막대를 끈다');
check(
  barValues([{ value: '1억 원' }, { value: '미공개' }]) === null,
  '일부만 깔리면 크기를 잘못 읽게 되므로 통째로 끈다',
);
check(barValues([{ value: '0명' }]) === null, '0 은 막대로 그릴 수 없다');

console.log(failed ? `\n❌ ${failed}개 실패\n` : '\n✅ 전부 통과\n');
process.exit(failed ? 1 : 0);
