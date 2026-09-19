/**
 * Pretendard 폰트를 node_modules에서 public/fonts로 복사한다.
 * - 저장소에 폰트 바이너리를 커밋하지 않기 위해 설치 후 자동 실행(postinstall)된다.
 * - 네트워크/외부 CDN에 의존하지 않으므로 오프라인에서도 렌더링이 된다.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'node_modules', 'pretendard', 'dist', 'web', 'static', 'woff2');
const destDir = join(root, 'public', 'fonts');

const WEIGHTS = [
  'Pretendard-Medium.woff2',
  'Pretendard-Bold.woff2',
  'Pretendard-ExtraBold.woff2',
  'Pretendard-Black.woff2',
];

export const setupFonts = ({ silent = false } = {}) => {
  if (!existsSync(srcDir)) {
    if (!silent) {
      console.warn('[fonts] pretendard 패키지를 찾을 수 없습니다. `npm install`을 먼저 실행하세요.');
    }
    return false;
  }
  mkdirSync(destDir, { recursive: true });
  let copied = 0;
  for (const file of WEIGHTS) {
    const from = join(srcDir, file);
    const to = join(destDir, file);
    if (!existsSync(from)) continue;
    if (existsSync(to)) continue;
    copyFileSync(from, to);
    copied += 1;
  }
  if (!silent) {
    console.log(`[fonts] Pretendard 준비 완료 (새로 복사한 파일: ${copied}개)`);
  }
  return true;
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  setupFonts();
}
