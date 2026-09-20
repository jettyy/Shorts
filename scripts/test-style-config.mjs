/**
 * node scripts/test-style-config.mjs
 *
 * 연출 설정을 **렌더러(src/lib/style.ts)와 서버(app/style-config.mjs)가 똑같이** 읽는지 본다.
 * 두 곳의 기본값이 갈라지면 화면과 소리가 어긋나는데, 눈으로는 알아채기 어렵다.
 */
import { readFileSync } from 'node:fs';
import { STYLE_DEFAULTS as SERVER_DEFAULTS, loadStyle } from '../app/style-config.mjs';
import { STYLE_DEFAULTS as RENDER_DEFAULTS, STYLE } from '../src/lib/style.ts';

let failed = 0;
const check = (ok, text) => {
  console.log(`  ${ok ? '✅' : '❌'} ${text}`);
  if (!ok) failed++;
};

console.log('\n기본값이 두 곳에서 같은가');
check(
  JSON.stringify(SERVER_DEFAULTS) === JSON.stringify(RENDER_DEFAULTS),
  '서버와 렌더러의 기본값이 완전히 같다',
);

console.log('\n설정 파일을 두 곳이 같게 읽는가');
const fromServer = loadStyle();
check(JSON.stringify(fromServer) === JSON.stringify(STYLE), 'config/style.json 해석 결과가 같다');

console.log('\n설정 파일 자체');
const raw = JSON.parse(readFileSync(new URL('../config/style.json', import.meta.url), 'utf8'));
check(Object.keys(raw).some((k) => k.startsWith('_')), '주석용 키(_)가 무시된다');
check(!('_' in fromServer), '주석 키가 설정값으로 새어나오지 않는다');
check([1, 1.1, 1.25].includes(fromServer.audio.speed), `속도가 허용값이다 (${fromServer.audio.speed})`);
check(
  ['number-first', 'comparison', 'provocative', 'question'].includes(fromServer.hook.style),
  `훅 방식이 아는 값이다 (${fromServer.hook.style})`,
);
check(
  ['bottom-up', 'winner-first', 'countdown'].includes(fromServer.rank.reveal),
  `순위 공개 순서가 아는 값이다 (${fromServer.rank.reveal})`,
);

console.log('\n설정이 깨졌을 때');
check(loadStyle().motion.emphasis.scale > 0, '읽기에 실패해도 기본값으로 돌아간다');

console.log(failed ? `\n❌ ${failed}개 실패\n` : '\n✅ 전부 통과\n');
process.exit(failed ? 1 : 0);
