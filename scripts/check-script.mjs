/**
 * npm run check
 *  → src/script.json 이 CARD_RULES.md 의 대본 규칙을 지키는지 점검한다.
 *
 * 렌더링 전에 한 번 돌리면 "글자가 넘친다 / 너무 빨리 넘어간다" 같은 사고를 막는다.
 * 규칙 위반은 ERROR(렌더 전에 고쳐야 함), 권고 위반은 WARN 으로 표시된다.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'src', 'script.json'), 'utf8'));

const MAX_LINES = 3;
const MAX_LINE_EM = 15;
const MIN_SEC = 2.5;
const MAX_SEC = 5;
const READ_SPEED = 4.5; // 초당 읽는 글자 수

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
const warns = [];
const cards = data.cards ?? [];

if (cards.length < 6 || cards.length > 8) {
  warns.push(`카드가 ${cards.length}장입니다. 권장 범위는 6~8장입니다.`);
}
if (!cards[0]?.isHook) errors.push('1번 카드에 "isHook": true 가 없습니다.');
if (!cards[cards.length - 1]?.isCta) errors.push('마지막 카드에 "isCta": true 가 없습니다.');

cards.forEach((card, i) => {
  const no = i + 1;
  if (!card.title?.trim()) {
    errors.push(`${no}번 카드: title 이 비어 있습니다.`);
    return;
  }
  const lines = wrap(card.title);
  if (lines.length > MAX_LINES) {
    errors.push(`${no}번 카드: ${lines.length}줄입니다(최대 ${MAX_LINES}줄). 문장을 더 줄이세요.`);
  }
  lines.forEach((l, li) => {
    if (emWidth(l) > MAX_LINE_EM + 1.5) {
      warns.push(`${no}번 카드 ${li + 1}째 줄이 깁니다("${l}"). 15자 내외로 끊으세요.`);
    }
  });

  const sec = Number(card.durationSec);
  if (!sec) {
    errors.push(`${no}번 카드: durationSec 이 없습니다.`);
    return;
  }
  if (sec < MIN_SEC || sec > MAX_SEC) {
    errors.push(`${no}번 카드: durationSec ${sec}초는 허용 범위(${MIN_SEC}~${MAX_SEC}초)를 벗어납니다.`);
  }
  const chars = card.title.replace(/\s|\n/g, '').length;
  const ideal = Math.min(Math.max(chars / READ_SPEED + 0.8, MIN_SEC), MAX_SEC);
  if (Math.abs(sec - ideal) > 1.0) {
    warns.push(
      `${no}번 카드: ${chars}자에 ${sec}초. 읽기 속도 기준 권장은 약 ${ideal.toFixed(1)}초입니다.`,
    );
  }
});

const totalSec = cards.reduce((s, c) => s + (Number(c.durationSec) || 0), 0);
console.log(`\n📋 카드 ${cards.length}장 / 총 ${totalSec.toFixed(1)}초\n`);
cards.forEach((c, i) => {
  const tag = c.isHook ? '[훅]' : c.isCta ? '[CTA]' : '   ';
  console.log(`  ${String(i + 1).padStart(2)}. ${tag} ${c.durationSec}s  ${wrap(c.title).join(' / ')}`);
});

if (warns.length) {
  console.log('\n⚠️  권고:');
  warns.forEach((w) => console.log(`   - ${w}`));
}
if (errors.length) {
  console.log('\n❌ 반드시 고쳐야 함:');
  errors.forEach((e) => console.log(`   - ${e}`));
  process.exit(1);
}
console.log('\n✅ 대본 규칙 통과. `npm run render` 로 영상을 만들 수 있습니다.\n');
