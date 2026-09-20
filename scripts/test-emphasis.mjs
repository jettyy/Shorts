/**
 * node scripts/test-emphasis.mjs
 *
 * 제목에서 숫자·순위 덩어리를 제대로 집어내는지 본다.
 * 단위가 숫자와 갈라지면(1,128만 / 원) 숫자만 커지고 단위는 작아져서 보기 흉하다.
 */
import { emphasize } from '../src/lib/emphasis.ts';

let failed = 0;
const show = (t) => (t.emphasis ? `[${t.text.trim()}]` : t.text.trim());

/** line, 강조돼야 하는 덩어리들 */
const cases = [
  ['1위 명지대', ['1위']],
  ['959만 원', ['959만 원']],
  ['20위 세종대 839만 원', ['20위', '839만 원']],
  ['연세대 995만 원', ['995만 원']],
  ['을지대 1,128만 원으로', ['1,128만 원으로']],
  ['등록금 TOP 20', ['TOP 20']],
  ['적금 2.8%가 아쉽다면?', ['2.8%가']],
  ['최대 8.25% 까지', ['최대', '8.25%']],
  ['4년 총액 차이', ['4년']],
  // 강조할 게 절반을 넘으면 강조가 아니다
  ['1위 2위 3위', []],
  ['순위를 그대로 믿으면 안 되는 이유', []],
];

for (const [line, want] of cases) {
  const tokens = emphasize(line);
  const got = tokens.filter((t) => t.emphasis).map((t) => t.text.trim());
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`  ${ok ? '✅' : '❌'} ${tokens.map(show).join(' ')}`);
  if (!ok) console.log(`       기대: ${JSON.stringify(want)} / 실제: ${JSON.stringify(got)}`);
}

// 토큰을 다시 이어붙이면 원문과 같아야 한다 (글자가 사라지면 안 된다)
for (const [line] of cases) {
  const joined = emphasize(line).map((t) => t.text).join('');
  if (joined !== line) {
    failed++;
    console.log(`  ❌ 글자가 바뀌었다: ${JSON.stringify(line)} → ${JSON.stringify(joined)}`);
  }
}

console.log(failed ? `\n❌ ${failed}개 실패\n` : '\n✅ 전부 통과 (글자 손실 없음)\n');
process.exit(failed ? 1 : 0);
