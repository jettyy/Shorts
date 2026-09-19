/**
 * 렌더링에 쓸 Chrome/Chromium 실행 파일을 찾는다.
 *
 * - 보통(윈도우/맥 개인 PC)은 Remotion이 전용 Chrome Headless Shell을 자동으로
 *   내려받으므로 아무것도 안 해도 된다. 이 경우 null을 돌려준다.
 * - 네트워크가 막힌 환경(사내망, CI, 원격 컨테이너)에서는 자동 다운로드가 실패하므로
 *   이미 설치돼 있는 Chrome/Chromium을 찾아서 쓴다.
 * - REMOTION_BROWSER_EXECUTABLE 환경변수를 주면 그 경로를 최우선으로 쓴다.
 */
import { existsSync } from 'node:fs';

const CANDIDATES = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: [
    // Remotion 기본 모드(headless-shell)와 호환되는 바이너리를 먼저 찾는다.
    '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ],
};

export const findBrowser = () => {
  const fromEnv = process.env.REMOTION_BROWSER_EXECUTABLE;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  // 윈도우/맥에서는 Remotion 자동 다운로드가 가장 안정적이라 그대로 맡긴다.
  if (process.platform !== 'linux') return null;

  for (const path of CANDIDATES.linux) {
    if (existsSync(path)) return path;
  }
  // PLAYWRIGHT_BROWSERS_PATH 아래에 설치된 경우도 훑어본다.
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (pw) {
    for (const sub of [
      'chromium_headless_shell-1194/chrome-linux/headless_shell',
      'chromium/chrome-linux/chrome',
      'chromium-1194/chrome-linux/chrome',
    ]) {
      const p = `${pw}/${sub}`;
      if (existsSync(p)) return p;
    }
  }
  return null;
};

const isMain = process.argv[1]?.endsWith('find-browser.mjs');
if (isMain) console.log(findBrowser() ?? '(Remotion 자동 다운로드 사용)');
