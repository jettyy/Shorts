/**
 * npm run check
 *  → src/script.json 을 점검한다.
 * npm run check -- docs/examples/ranking-demo.json
 *  → 다른 대본 파일을 점검한다.
 *
 * 두 가지를 본다.
 *  1) 렌더링이 깨지는 구조적 문제 (ERROR — 이건 고쳐야 영상이 나온다)
 *  2) "양산형 요약 영상"으로 보일 위험 (안내 — 렌더는 막지 않는다)
 *
 * 2번은 유튜브가 수익화 불가 사례로 명시한
 * "해설·교육적 가치가 거의 없는 이미지 슬라이드쇼 / 스크롤 텍스트"에 가까워지지 않도록
 * 스스로 점검하라는 용도다. 판단은 사람이 한다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] ? join(root, process.argv[2]) : join(root, 'src', 'script.json');
const data = JSON.parse(readFileSync(target, 'utf8'));
const cards = data.cards ?? [];

const MAX_LINES = 3;
const MAX_LINE_EM = 17;

const emWidth = (line) =>
  [...line].reduce((sum, ch) => {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === ' ') return sum + 0.3;
    if (
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0x4e00 && code <= 0x9fff)
    )
      return sum + 1;
    if (/[.,!?'"·:;()]/.test(ch)) return sum + 0.34;
    return sum + 0.56;
  }, 0);

const wrap = (title) => {
  const manual = title.split('\n').map((l) => l.trim()).filter(Boolean);
  if (manual.length > 1) return manual;
  const words = (manual[0] ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (cur && emWidth(cand) > MAX_LINE_EM) {
      lines.push(cur);
      cur = w;
    } else cur = cand;
  }
  if (cur) lines.push(cur);
  return lines;
};

const errors = [];
const notes = [];

/* ── 1) 구조 검사 (렌더가 깨지는 것들) ───────────────────── */
if (!cards.length) errors.push('cards 배열이 비어 있습니다.');
if (!data.source?.url) errors.push('source.url 이 없습니다. 출처 없이 만들지 않습니다.');
if (!data.source?.checkedOn) {
  errors.push('source.checkedOn(정보 확인 기준일)이 없습니다. 제도·요율은 바뀝니다.');
}

const VALID_TYPES = ['hook', 'fact', 'condition', 'example', 'caveat', 'conclusion'];
cards.forEach((card, i) => {
  const no = i + 1;
  if (!card.title?.trim()) errors.push(`${no}번 카드: title 이 비어 있습니다.`);
  if (!VALID_TYPES.includes(card.type)) {
    errors.push(`${no}번 카드: type 이 "${card.type}" 입니다. ${VALID_TYPES.join(' / ')} 중 하나여야 합니다.`);
  }
  if (!['source', 'creator'].includes(card.origin)) {
    errors.push(`${no}번 카드: origin 은 "source"(원문 확인) 또는 "creator"(직접 분석) 여야 합니다.`);
  }
  if (!Number(card.durationSec)) errors.push(`${no}번 카드: durationSec 이 없습니다.`);

  const lines = wrap(card.title ?? '');
  if (lines.length > MAX_LINES) {
    errors.push(`${no}번 카드: 제목이 ${lines.length}줄입니다(최대 ${MAX_LINES}줄).`);
  }
});

/* ── 도표가 카드 밖으로 넘치는지 ──────────────────────────
 *
 * 도표는 항목 수에 맞춰 스스로 작아지지만(`src/lib/density.ts`),
 * 글자가 읽을 수 있는 하한(26px)에 닿으면 더 못 줄인다. 그때부터는 잘린다.
 * 항목을 줄이는 게 아니라 **카드를 나누는 것**이 답이라서, 몇 장으로 나눌지까지 알려준다.
 *
 * 아래 수치는 각 도표 컴포넌트의 설계 원본 크기와 같아야 한다.
 * (행 높이·여백·"반드시 읽혀야 하는 글자" 크기)
 */
const VISUAL_BUDGET = 980; // src/lib/density.ts 와 같아야 한다
const MIN_FONT = 26;
const VISUAL_SHAPE = {
  ranklist: { key: 'items', per: 84, gap: 12, font: 36, head: 0 },
  bar: { key: 'items', per: 124, gap: 22, font: 34, head: 0 },
  checklist: { key: 'items', per: 96, gap: 16, font: 40, head: 0 },
  table: { key: 'rows', per: 82, gap: 0, font: 34, head: 48 },
  calc: { key: 'lines', per: 68, gap: 0, font: 36, head: 94 },
  timeline: { key: 'items', per: 135, gap: 0, font: 42, head: 0 },
  flow: { key: 'nodes', per: 118, gap: 53, font: 46, head: 0 },
};

const maxItemsFor = ({ per, gap, font, head }) => {
  const minScale = Math.min(1, MIN_FONT / font);
  const room = VISUAL_BUDGET / minScale - head;
  return Math.max(1, Math.floor((room + gap) / (per + gap)));
};

cards.forEach((card, i) => {
  const shape = VISUAL_SHAPE[card.visual?.kind];
  if (!shape) return;
  const count = (card.visual[shape.key] ?? []).length;
  const max = maxItemsFor(shape);
  if (count > max) {
    const parts = Math.ceil(count / max);
    notes.push(
      `${i + 1}번 카드: ${card.visual.kind} 항목이 ${count}개라 카드 밖으로 넘칩니다(한 장 최대 ${max}개). ` +
        `항목을 지우지 말고 카드 ${parts}장으로 나눠 이어서 보여주세요` +
        (card.visual.kind === 'ranklist' ? ' (rank 를 직접 지정하면 번호가 이어집니다).' : '.'),
    );
  }
});

if (cards[0] && cards[0].type !== 'hook') {
  errors.push('1번 카드의 type 은 "hook" 이어야 합니다.');
}
const last = cards[cards.length - 1];
if (last && last.type !== 'conclusion') {
  errors.push('마지막 카드의 type 은 "conclusion"(제작자의 결론) 이어야 합니다.');
}

/* ── 2) 내용 점검 (안내만, 렌더는 막지 않음) ─────────────── */
const creatorCards = cards.filter((c) => c.origin === 'creator');
const visualCards = cards.filter((c) => c.visual);
const noNarration = cards.filter((c) => !c.narration?.trim());

if (creatorCards.length < 3) {
  notes.push(
    `직접 분석(origin: "creator") 카드가 ${creatorCards.length}장입니다. ` +
      '원문 요약만으로 채워진 영상이 되지 않게 3장 이상을 권합니다.',
  );
}
if (visualCards.length < cards.length - 1) {
  notes.push(
    `도표가 있는 카드가 ${visualCards.length}/${cards.length}장입니다. ` +
      '글자만 있는 카드가 많을수록 "자막 슬라이드쇼"에 가까워집니다.',
  );
}
if (noNarration.length) {
  notes.push(
    `내레이션이 비어 있는 카드: ${noNarration.map((_, i) => cards.indexOf(noNarration[i]) + 1).join(', ')}번. ` +
      '`npm run narration` 으로 녹음 대본을 만들 수 있습니다.',
  );
}
if (!cards.some((c) => c.type === 'example')) {
  notes.push('직접 계산·사례(type: "example") 카드가 없습니다. 독창성 면에서 가장 효과가 큰 카드입니다.');
}
if (!cards.some((c) => c.type === 'caveat')) {
  notes.push('주의점·예외(type: "caveat") 카드가 없습니다. 원문에 없는 내용을 넣기 가장 좋은 자리입니다.');
}
if (!data.narrationAudio) {
  notes.push('직접 녹음한 내레이션(narrationAudio)이 아직 없습니다. 목소리가 있으면 완성도가 크게 달라집니다.');
}

// 원문을 그대로 베꼈는지 점검 (.source/current.txt 가 있을 때만)
const srcFile = join(root, '.source', 'current.txt');
if (existsSync(srcFile)) {
  const raw = readFileSync(srcFile, 'utf8').replace(/\s/g, '');
  const N = 14; // 연속 14자가 같으면 그대로 옮겨 적은 것으로 본다
  const shingles = new Set();
  for (let i = 0; i + N <= raw.length; i++) shingles.add(raw.slice(i, i + N));

  cards.forEach((card, i) => {
    const text = `${card.title ?? ''}${card.body ?? ''}${card.narration ?? ''}`.replace(/\s/g, '');
    for (let j = 0; j + N <= text.length; j++) {
      if (shingles.has(text.slice(j, j + N))) {
        notes.push(`${i + 1}번 카드에 원문과 똑같은 문장이 들어 있습니다: "${text.slice(j, j + N)}…" → 직접 다시 쓰세요.`);
        break;
      }
    }
  });
} else {
  notes.push('원문을 `.source/current.txt` 에 저장해두면 원문 문장을 그대로 베꼈는지 자동으로 검사합니다.');
}

/* ── 출력 ─────────────────────────────────────────────── */
const totalSec = cards.reduce((s, c) => s + (Number(c.durationSec) || 0), 0);
console.log(`\n📋 ${data.topic ?? ''} — 카드 ${cards.length}장 / 총 ${totalSec.toFixed(1)}초\n`);
cards.forEach((c, i) => {
  const badge = c.origin === 'creator' ? '직접분석' : '원문확인';
  const vis = c.visual ? c.visual.kind : '—';
  console.log(
    `  ${String(i + 1).padStart(2)}. [${badge}] ${String(c.type).padEnd(10)} ` +
      `${String(c.durationSec).padStart(4)}s  ${String(vis).padEnd(9)} ${wrap(c.title ?? '').join(' / ')}`,
  );
});

console.log(
  `\n  직접 분석 ${creatorCards.length}/${cards.length}장 · 도표 ${visualCards.length}/${cards.length}장 · ` +
    `내레이션 ${cards.length - noNarration.length}/${cards.length}장`,
);

if (notes.length) {
  console.log('\n💡 점검해볼 것 (렌더는 가능합니다):');
  notes.forEach((n) => console.log(`   - ${n}`));
}
if (errors.length) {
  console.log('\n❌ 고쳐야 렌더링됩니다:');
  errors.forEach((e) => console.log(`   - ${e}`));
  process.exit(1);
}
console.log('\n✅ 구조 이상 없음. `npm run render` 로 영상을 만들 수 있습니다.\n');
