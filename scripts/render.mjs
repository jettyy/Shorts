/**
 * npm run render
 *  → src/script.json 을 읽어 output/카드뉴스_[타임스탬프].mp4 로 렌더링한다.
 *
 * 타임스탬프 파일명과 폰트 준비를 Windows/macOS/Linux에서 동일하게 처리하려고
 * npm 스크립트 문자열 대신 node 스크립트로 감쌌다.
 * (실제로 실행되는 명령: npx remotion render CardNews output/카드뉴스_....mp4)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupFonts } from './setup-fonts.mjs';
import { findBrowser } from './find-browser.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = join(root, 'src', 'script.json');
const outputDir = join(root, 'output');

if (!existsSync(scriptPath)) {
  console.error('[render] src/script.json 이 없습니다. 먼저 카드 대본을 만들어 주세요.');
  process.exit(1);
}

const data = JSON.parse(readFileSync(scriptPath, 'utf8'));
if (!Array.isArray(data.cards) || data.cards.length === 0) {
  console.error('[render] src/script.json 의 cards 배열이 비어 있습니다.');
  process.exit(1);
}

setupFonts({ silent: true });
mkdirSync(outputDir, { recursive: true });

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const stamp =
  `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
  `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

// 주제가 있으면 파일명에 붙여 나중에 구분하기 쉽게 한다.
const slug = String(data.topic ?? '')
  .replace(/[\\/:*?"<>|\s]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 40);

const fileName = slug ? `카드뉴스_${slug}_${stamp}.mp4` : `카드뉴스_${stamp}.mp4`;
const outPath = join('output', fileName);

const totalSec = data.cards.reduce((s, c) => s + (Number(c.durationSec) || 0), 0);
console.log(`[render] 카드 ${data.cards.length}장 / 약 ${totalSec.toFixed(1)}초`);
console.log(`[render] 출력: ${outPath}`);

// 네트워크가 막힌 환경에서는 설치돼 있는 Chrome을 직접 지정한다(없으면 Remotion이 자동 다운로드).
const browser = findBrowser();
const browserArgs = browser ? [`--browser-executable=${browser}`] : [];
if (browser) console.log(`[render] 브라우저: ${browser}`);

const extraArgs = process.argv.slice(2);
const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['remotion', 'render', 'CardNews', outPath, ...browserArgs, ...extraArgs],
  { cwd: root, stdio: 'inherit' },
);

if (result.status !== 0) {
  console.error('[render] 렌더링 실패');
  process.exit(result.status ?? 1);
}
console.log(`\n✅ 완성: ${outPath}`);
