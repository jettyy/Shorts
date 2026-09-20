/**
 * node scripts/test-next-slot.mjs
 *
 * nextSlot() 검증 — 유튜브 API 를 가짜로 세워서 돌린다.
 * 확인할 것:
 *   1) 예약된 것 중 가장 늦은 시각을 고르는가
 *   2) 그 뒤 3~5시간 사이인가, 5분 단위인가
 *   3) 가장 늦은 예약이 이미 지났으면 "지금" 기준으로 잡는가
 *   4) 예약이 하나도 없으면 "지금" 기준인가
 *   5) 권한이 없으면(403) 실패하지 않고 안내와 함께 추천을 돌려주는가
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dirname, join as pjoin } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createYouTube } from '../app/youtube.mjs';

const dir = mkdtempSync(join(tmpdir(), 'yt-'));
writeFileSync(
  join(dir, 'youtube.json'),
  JSON.stringify({ clientId: 'x', clientSecret: 'y', refreshToken: 'z' }),
);
const yt = createYouTube(dir);

const H = 3600_000;
const iso = (d) => new Date(d).toISOString();

/** 가짜 유튜브 API */
function stub({ videos, forbid = false }) {
  globalThis.fetch = async (url) => {
    const u = String(url);
    const ok = (body) => ({ ok: true, json: async () => body, headers: new Map() });
    if (u.includes('oauth2.googleapis.com/token')) return ok({ access_token: 'tok' });
    if (forbid) {
      return {
        ok: false,
        status: 403,
        json: async () => ({ error: { message: 'Insufficient Permission', errors: [{ reason: 'insufficientPermissions' }] } }),
      };
    }
    if (u.includes('channels?')) {
      return ok({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }] });
    }
    if (u.includes('playlistItems?')) {
      return ok({ items: videos.map((v, i) => ({ contentDetails: { videoId: `v${i}` } })) });
    }
    if (u.includes('videos?')) {
      return ok({
        items: videos.map((v, i) => ({
          id: `v${i}`,
          snippet: { title: v.title ?? `영상 ${i}` },
          status: v.publishAt ? { publishAt: v.publishAt, privacyStatus: 'private' } : { privacyStatus: 'public' },
        })),
      });
    }
    throw new Error(`예상 못한 호출: ${u}`);
  };
}

let failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failed++;
};

// ── 1) 가장 늦은 예약 뒤 3~5시간 ─────────────────────────
{
  const now = Date.now();
  const latest = now + 30 * H;
  stub({
    videos: [
      { publishAt: iso(now + 10 * H), title: '중간' },
      { publishAt: iso(latest), title: '제일 늦은 예약' }, // 이게 기준이어야 한다
      { publishAt: iso(now + 5 * H), title: '가장 이른' },
      {}, // 예약 아닌 공개 영상 — 무시돼야 한다
    ],
  });
  const r = await yt.nextSlot();
  const gap = (new Date(r.suggested) - latest) / H;
  console.log('\n[1] 예약이 여러 개일 때');
  check('가장 늦은 예약을 기준으로 삼는다', r.basedOn === iso(latest), r.basedOnTitle);
  check('예약 개수를 센다 (3개)', r.scheduledCount === 3, `${r.scheduledCount}개`);
  check('3~5시간 뒤다', gap >= 3 && gap <= 5, `${gap.toFixed(2)}시간`);
  check('5분 단위다', new Date(r.suggested).getMinutes() % 5 === 0);
  check('초는 0이다', new Date(r.suggested).getSeconds() === 0);
}

// ── 2) 랜덤인지 (같은 입력으로 여러 번) ────────────────────
{
  const now = Date.now();
  const latest = now + 30 * H;
  stub({ videos: [{ publishAt: iso(latest) }] });
  const runs = [];
  for (let i = 0; i < 30; i++) runs.push((await yt.nextSlot()).suggested);
  const uniq = new Set(runs).size;
  const gaps = runs.map((s) => (new Date(s) - latest) / H);
  console.log('\n[2] 30번 돌렸을 때');
  check('매번 같은 시각이 아니다 (랜덤)', uniq > 5, `서로 다른 값 ${uniq}개`);
  check('전부 3~5시간 안에 있다', gaps.every((g) => g >= 3 && g <= 5),
    `${Math.min(...gaps).toFixed(2)}~${Math.max(...gaps).toFixed(2)}시간`);
}

// ── 3) 가장 늦은 예약이 이미 지났을 때 ─────────────────────
{
  const now = Date.now();
  stub({ videos: [{ publishAt: iso(now - 50 * H) }] });
  const r = await yt.nextSlot();
  const gapFromNow = (new Date(r.suggested) - now) / H;
  console.log('\n[3] 예약이 전부 과거일 때');
  check('과거 시각을 추천하지 않는다', new Date(r.suggested) > new Date(), iso(r.suggested));
  check('지금 기준 3~5시간 뒤다', gapFromNow >= 3 && gapFromNow <= 5, `${gapFromNow.toFixed(2)}시간`);
}

// ── 4) 예약이 하나도 없을 때 ───────────────────────────────
{
  const now = Date.now();
  stub({ videos: [{}, {}] });
  const r = await yt.nextSlot();
  const gapFromNow = (new Date(r.suggested) - now) / H;
  console.log('\n[4] 예약된 영상이 없을 때');
  check('basedOn 이 없다', r.basedOn === null);
  check('지금 기준 3~5시간 뒤다', gapFromNow >= 3 && gapFromNow <= 5, `${gapFromNow.toFixed(2)}시간`);
}

// ── 5) 권한 부족(403) ─────────────────────────────────────
{
  stub({ videos: [], forbid: true });
  const r = await yt.nextSlot();
  console.log('\n[5] 목록 읽기 권한이 없을 때');
  check('예외로 죽지 않는다', Boolean(r.suggested));
  check('다시 연결하라고 안내한다', /다시 연결/.test(r.note ?? ''), r.note);
}

console.log(failed ? `\n❌ ${failed}개 실패\n` : '\n✅ 전부 통과\n');
process.exit(failed ? 1 : 0);
