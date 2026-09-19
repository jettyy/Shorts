/**
 * npm run still -- 35
 *  → 특정 프레임 한 장을 PNG로 뽑아 디자인을 빠르게 확인한다.
 *    (영상 전체를 렌더링하지 않아도 되므로 시안 확인용으로 빠르다)
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupFonts } from './setup-fonts.mjs';
import { findBrowser } from './find-browser.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const frame = Number(process.argv[2] ?? 30);
const outDir = join(root, 'output');

setupFonts({ silent: true });
mkdirSync(outDir, { recursive: true });

const browser = findBrowser();
const outPath = join('output', `still_${frame}.png`);

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  [
    'remotion',
    'still',
    'CardNews',
    outPath,
    `--frame=${frame}`,
    ...(browser ? [`--browser-executable=${browser}`] : []),
  ],
  { cwd: root, stdio: 'inherit' },
);
process.exit(result.status ?? 0);
