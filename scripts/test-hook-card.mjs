/**
 * node scripts/test-hook-card.mjs
 *
 * 1번 카드(훅) 규칙이 실제로 잡히는지 본다.
 *
 * 쇼츠는 첫 0.5초에 계속 볼지가 정해진다. 그런데 예전 영상은 0프레임에 글자 덩어리가
 * **9개**나 있었다 — 라벨·장수·배너·제목 2줄·보조설명·큰 숫자·단위·설명.
 * 정작 "무슨 영상인지"는 3번째로 큰 글자라 묻혔고, 같은 숫자를 세 번 말하고 있었다.
 *
 * 눈으로는 "왜 심심하지" 정도로만 느껴져서 놓치기 쉬운 것들이라 검사기가 짚어준다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const dir = mkdtempSync(join(tmpdir(), 'hook-'));

/** 기준이 되는 좋은 훅 카드 (docs/examples/ranking-demo.json) */
const base = JSON.parse(readFileSync(join(root, 'docs/examples/ranking-demo.json'), 'utf8'));

/** 대본을 고쳐서 검사기를 돌리고 출력을 돌려준다 */
const runCheck = (mutate) => {
  const data = JSON.parse(JSON.stringify(base));
  mutate(data.cards[0], data);
  const file = join(dir, `s${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, JSON.stringify(data), 'utf8');
  try {
    return execFileSync('node', [join(root, 'scripts/check-script.mjs'), file], {
      encoding: 'utf8',
    });
  } catch (e) {
    // ERROR 가 있으면 종료코드가 1 이다. 출력은 그대로 본다.
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
};

let failed = 0;
const check = (ok, text) => {
  console.log(`  ${ok ? '✅' : '❌'} ${text}`);
  if (!ok) failed++;
};

console.log('\n기준 대본은 조용해야 한다');
const clean = runCheck(() => {});
check(!/1번 카드/.test(clean), '좋은 훅 카드에는 아무 말도 안 한다');
check(/구조 이상 없음/.test(clean), '렌더 가능하다고 나온다');

console.log('\n첫 화면에 그려지지도 않는 항목');
check(
  /1번 카드의 kicker/.test(runCheck((c) => (c.kicker = '직접 계산'))),
  'kicker 가 있으면 짚어준다',
);
check(
  /1번 카드의 body/.test(runCheck((c) => (c.body = '보조 설명'))),
  'body 가 있으면 짚어준다',
);

console.log('\n제목이 1위 값을 되풀이할 때');
check(
  /되풀이합니다/.test(runCheck((c) => (c.title = '1위는 1억 847만 원\n입니다'))),
  '같은 숫자를 두 번 말하면 짚어준다',
);
check(
  !/되풀이합니다/.test(runCheck((c) => (c.title = '2위부터가\n더 놀랍습니다'))),
  '가려진 순위를 가리키는 제목은 통과시킨다',
);
check(
  !/되풀이합니다/.test(
    runCheck((c) => {
      c.title = '16위도\n8천만 원입니다';
    }),
  ),
  '다른 순위의 숫자를 쓰는 건 되풀이가 아니다',
);

console.log('\n첫 화면이 너무 길 때');
check(
  /1번 카드가 5.4초/.test(runCheck((c) => (c.durationSec = 5.4))),
  '4초를 넘으면 짚어준다 (정지 화면을 그만큼 보게 된다)',
);
check(
  !/첫 화면이 길면/.test(runCheck((c) => (c.durationSec = 2.6))),
  '3초 안쪽이면 조용하다',
);

console.log('\n훅 카드 순위 미리보기');
const hookVisual = base.cards[0].visual;
check(hookVisual?.kind === 'ranklist', '순위 영상의 훅 카드는 ranklist 를 쓴다');
check(hookVisual?.revealCount === 1, '1위만 공개한다 (revealCount: 1)');
check(
  (hookVisual?.items ?? []).length >= 5 && (hookVisual?.items ?? []).length <= 7,
  `미리보기 행이 5~7행이다 (${hookVisual?.items?.length}행)`,
);
check(
  (hookVisual?.items ?? []).every((it) => String(it.value ?? '').trim()),
  '가려질 행도 값이 채워져 있다 (2번 카드부터 그대로 쓰인다)',
);

console.log('\n배너가 커진 만큼 검사기도 알고 있어야 한다');
const src = readFileSync(join(root, 'scripts/check-script.mjs'), 'utf8');
const text = readFileSync(join(root, 'src/lib/text.ts'), 'utf8');
const heroMax = Number(/BANNER_HERO = \{ max: (\d+)/.exec(text)?.[1]);
check(
  src.includes(`Math.round(${heroMax} * 1.18)`),
  `배너 최대 크기(${heroMax}px)가 검사기의 HERO_HEADLINE_H 와 같다`,
);

console.log(failed ? `\n❌ ${failed}개 실패\n` : '\n✅ 전부 통과\n');
process.exit(failed ? 1 : 0);
