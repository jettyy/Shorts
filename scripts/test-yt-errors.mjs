/**
 * node scripts/test-yt-errors.mjs
 *
 * 유튜브가 돌려주는 영어 오류가 "무엇을 하라"는 한국어 안내로 바뀌는지 본다.
 * 특히 accessNotConfigured 는 공개 설정과 무관하게 모든 업로드를 막는데,
 * 생짜로 보여주면 비공개 문제로 오해하기 쉬워서 반드시 번역돼야 한다.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createYouTube } from '../app/youtube.mjs';

const PKG = new URL('../package.json', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'yt-'));
writeFileSync(join(dir, 'youtube.json'),
  JSON.stringify({ clientId: 'x', clientSecret: 'y', refreshToken: 'z' }));
const yt = createYouTube(dir);

// 사용자가 실제로 본 응답 그대로
const real = {
  error: {
    code: 403,
    message: 'YouTube Data API v3 has not been used in project 635015660634 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/youtube.googleapis.com/overview?project=635015660634 then retry. If you enabled this API recently, wait a few minutes for the action to propagate to our systems and retry.',
    errors: [{ reason: 'accessNotConfigured', domain: 'usageLimits' }],
  },
};

const cases = [
  ['API 미사용 설정 (사용자가 본 오류)', real],
  ['채널 없음', { error: { code: 403, message: 'Unauthorized', errors: [{ reason: 'youtubeSignupRequired' }] } }],
  ['할당량 소진', { error: { code: 403, message: 'quota', errors: [{ reason: 'quotaExceeded' }] } }],
  ['예약 시각 거절', { error: { code: 400, message: 'The publishAt time must be in the future.', errors: [{ reason: 'invalidPublishAt' }] } }],
];

globalThis.fetch = async (url) => {
  if (String(url).includes('oauth2')) return { ok: true, json: async () => ({ access_token: 't' }) };
  return { ok: false, status: caseData.error.code, text: async () => JSON.stringify(caseData), json: async () => caseData, headers: new Map() };
};

let caseData;
let failed = 0;
for (const [name, data] of cases) {
  caseData = data;
  try {
    await yt.upload({ filePath: PKG, meta: {}, mode: 'private' });
    console.log(`❌ ${name} — 오류가 안 났다`);
  } catch (e) {
    const ok = !/^\{|"error"|has not been used/.test(e.message); // 영어 JSON 이 새어나오면 실패
    if (!ok) failed++;
    console.log(`\n${ok ? '✅' : '❌'} ${name}\n${e.message}`);
  }
}

console.log(failed ? `\n❌ ${failed}개가 번역되지 않았습니다\n` : '\n✅ 전부 한국어 안내로 바뀝니다\n');
process.exit(failed ? 1 : 0);
