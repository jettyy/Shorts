/**
 * npm run narration          → 녹음용 내레이션 대본을 만든다
 * npm run narration -- --fit → 내레이션 길이에 맞춰 각 카드 durationSec 을 다시 계산해 저장한다
 *
 * 이 프로젝트는 영상에 직접 녹음한 목소리를 얹는 걸 전제로 한다.
 * 카드 자막만 넘어가는 영상과, 본인 해설이 깔린 영상은 완성도가 다르다.
 *
 * 녹음 후에는 mp3 를 public/audio/ 에 넣고 script.json 에 아래를 추가하면 끝이다.
 *   "narrationAudio": "audio/내파일.mp3"
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = join(root, 'src', 'script.json');
const data = JSON.parse(readFileSync(scriptPath, 'utf8'));

/** 한국어 내레이션 기준 초당 읽는 글자 수 (공백 제외, 또박또박 읽는 속도) */
const SPEAK_CPS = 5.2;
/** 카드가 바뀌기 전후로 두는 숨 쉴 틈(초) */
const BREATH = 0.7;

const chars = (s) => (s ?? '').replace(/\s/g, '').length;
const speakSec = (s) => chars(s) / SPEAK_CPS;
const fmt = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
};

const fit = process.argv.includes('--fit');
const cards = data.cards ?? [];

if (fit) {
  // 내레이션을 다 읽을 시간 + 숨 쉴 틈으로 카드 길이를 다시 잡는다.
  cards.forEach((c) => {
    const needed = speakSec(c.narration) + BREATH;
    c.durationSec = Math.round(Math.max(needed, 2.5) * 10) / 10;
  });
  writeFileSync(scriptPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('[narration] 내레이션 길이에 맞춰 durationSec 을 다시 계산했습니다.\n');
}

let cursor = 0;
const rows = cards.map((c, i) => {
  const start = cursor;
  cursor += Number(c.durationSec) || 0;
  const need = speakSec(c.narration);
  return { no: i + 1, card: c, start, end: cursor, need };
});

const lines = [];
lines.push(`# 내레이션 녹음 대본 — ${data.topic ?? ''}`);
lines.push('');
lines.push(`- 전체 길이: **${cursor.toFixed(1)}초**`);
lines.push(`- 출처: ${data.source?.publisher ?? ''} ${data.source?.title ?? ''} (${data.source?.url ?? ''})`);
lines.push(`- 정보 확인 기준일: ${data.source?.checkedOn ?? '미기재'}`);
lines.push('');
lines.push('## 녹음 방법');
lines.push('');
lines.push('1. 아래 대본을 순서대로 읽고 하나의 파일로 녹음합니다(카드별로 끊지 않아도 됩니다).');
lines.push('2. 괄호 안 시간은 그 카드가 화면에 떠 있는 구간입니다. 대략 맞추면 됩니다.');
lines.push('3. 녹음 파일을 `public/audio/` 에 넣고, `src/script.json` 에 아래 줄을 추가합니다.');
lines.push('   ```json');
lines.push('   "narrationAudio": "audio/내파일.mp3"');
lines.push('   ```');
lines.push('4. `npm run render` 로 다시 렌더링하면 목소리가 얹힌 영상이 나옵니다.');
lines.push('');
lines.push('> 타이밍이 빡빡하면 `npm run narration -- --fit` 을 돌리세요.');
lines.push('> 읽는 속도에 맞춰 각 카드 길이를 다시 계산해줍니다.');
lines.push('');
lines.push('---');
lines.push('');

const tight = [];
for (const r of rows) {
  const label = r.card.origin === 'creator' ? '직접 분석' : '원문 확인';
  lines.push(`### ${r.no}. ${r.card.type} · ${label}  (${fmt(r.start)} ~ ${fmt(r.end)})`);
  lines.push('');
  lines.push(`> 화면: ${r.card.title.replace(/\n/g, ' / ')}${r.card.visual ? ` — [${r.card.visual.kind}]` : ''}`);
  lines.push('');
  lines.push(r.card.narration || '(내레이션 없음)');
  lines.push('');
  const slack = (Number(r.card.durationSec) || 0) - r.need;
  if (slack < 0.2) {
    tight.push(`${r.no}번: 읽는 데 약 ${r.need.toFixed(1)}초인데 카드는 ${r.card.durationSec}초`);
  }
  lines.push(`\`읽는 시간 약 ${r.need.toFixed(1)}초 / 카드 ${r.card.durationSec}초\``);
  lines.push('');
}

const outDir = join(root, 'output');
mkdirSync(outDir, { recursive: true });
const pad = (n) => String(n).padStart(2, '0');
const d = new Date();
const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
const outPath = join(outDir, `내레이션_${stamp}.md`);
writeFileSync(outPath, lines.join('\n'), 'utf8');

console.log(`📝 녹음 대본: output/내레이션_${stamp}.md`);
console.log(`   전체 ${cursor.toFixed(1)}초 / 카드 ${cards.length}장`);
if (tight.length) {
  console.log('\n⏱  읽을 시간이 빠듯한 카드가 있습니다:');
  tight.forEach((t) => console.log(`   - ${t}`));
  console.log('   → `npm run narration -- --fit` 으로 카드 길이를 자동 조정할 수 있습니다.');
}
