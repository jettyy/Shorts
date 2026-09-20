/**
 * `src/script.json` 이 없으면 기본 대본(`src/script.default.json`)을 복사해둔다.
 *
 * **왜 필요한가**
 * `src/script.json` 은 앱이 대본을 만들 때마다 덮어쓰는 "작업 파일"이다.
 * 그런데 예전에는 이 파일이 git 에 추적되고 있어서, 영상을 한 번이라도 만들면
 * 파일이 바뀌고 그 뒤로 `git pull` 이 이렇게 막혔다.
 *
 *     error: Your local changes to the following files would be overwritten by merge:
 *             src/script.json
 *
 * 받아오지 못한 채 예전 코드가 계속 돌아서, 고친 내용이 반영되지 않는 일이 반복됐다.
 * 그래서 작업 파일은 git 에서 빼고(.gitignore), **틀만 저장소에 둔다.**
 *
 * `src/Root.tsx` 가 이 파일을 정적으로 import 하므로 **없으면 빌드가 깨진다.**
 * npm install 때와 서버가 켜질 때 한 번씩 확인해서 없으면 만들어 둔다.
 */
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const TARGET = join(root, 'src', 'script.json');
const TEMPLATE = join(root, 'src', 'script.default.json');

export const ensureScript = ({ silent = false } = {}) => {
  if (existsSync(TARGET)) return false;
  if (!existsSync(TEMPLATE)) {
    if (!silent) console.warn('[대본] src/script.default.json 이 없습니다. 저장소가 온전한지 확인해주세요.');
    return false;
  }
  copyFileSync(TEMPLATE, TARGET);
  if (!silent) console.log('[대본] src/script.json 이 없어서 기본 대본으로 만들었습니다.');
  return true;
};

// 직접 실행했을 때 (npm install 의 postinstall)
if (import.meta.url === `file://${process.argv[1]}`) ensureScript();
