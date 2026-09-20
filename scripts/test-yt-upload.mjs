/**
 * node scripts/test-yt-upload.mjs
 *
 * 업로드 본문이 **한 바이트도 빠짐없이** 전송되는지 본다.
 *
 * 예전에는 진행률을 재려고 `stream.on('data', …)` 를 붙였는데, 그 순간 스트림이
 * flowing 모드가 되어 fetch 가 읽기 전에 데이터가 새어나갔다. 실제 전송량이
 * Content-Length 보다 적어서 undici 가 요청을 끊었고, 화면에는 원인을 알 수 없는
 * "fetch failed" 만 떴다(UND_ERR_REQ_CONTENT_LENGTH_MISMATCH).
 *
 * 구글 대신 가짜 resumable 업로드 서버를 세워서 받은 바이트를 센다.
 */
import http from 'node:http';
import { mkdtempSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createYouTube } from '../app/youtube.mjs';

const dir = mkdtempSync(join(tmpdir(), 'yt-'));
writeFileSync(
  join(dir, 'youtube.json'),
  JSON.stringify({ clientId: 'x', clientSecret: 'y', refreshToken: 'z' }),
);
const yt = createYouTube(dir);

// 실제 쇼츠 영상 정도 크기(5MB)
const video = join(dir, 'video.mp4');
writeFileSync(video, Buffer.alloc(5 * 1024 * 1024, 7));
const size = statSync(video).size;

let received = 0;
let declared = null;
const server = http.createServer((req, res) => {
  if (req.method === 'PUT') {
    declared = Number(req.headers['content-length']);
    req.on('data', (c) => (received += c.length));
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'VIDEO123', status: { privacyStatus: 'private' } }));
    });
    return;
  }
  // 세션 시작 → 업로드 주소를 알려준다
  res.writeHead(200, {
    'Content-Type': 'application/json',
    Location: `http://127.0.0.1:${server.address().port}/session`,
  });
  res.end('{}');
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;

// 토큰 발급과 업로드 시작 주소만 가짜 서버로 돌린다
const realFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => {
  const u = String(url);
  if (u.includes('oauth2.googleapis.com')) {
    return Promise.resolve({ ok: true, json: async () => ({ access_token: 'tok' }) });
  }
  if (u.includes('googleapis.com/upload')) return realFetch(base, opts);
  return realFetch(url, opts);
};

let failed = 0;
const check = (ok, text) => {
  console.log(`  ${ok ? '✅' : '❌'} ${text}`);
  if (!ok) failed++;
};

const progress = [];
try {
  const r = await yt.upload({
    filePath: video,
    meta: { title: '테스트', description: '', tags: [] },
    mode: 'private',
    onProgress: (p) => progress.push(p.sent),
  });

  console.log(`\n5MB 영상 업로드`);
  check(received === size, `서버가 받은 바이트 ${received.toLocaleString()} / 보낸다고 한 ${size.toLocaleString()}`);
  check(declared === size, `Content-Length 가 실제 크기와 같다 (${declared?.toLocaleString()})`);
  check(progress.length > 1, `진행률이 여러 번 보고됐다 (${progress.length}회)`);
  check(
    progress.at(-1) === size,
    `마지막 진행률이 전체 크기와 같다 (${progress.at(-1)?.toLocaleString()})`,
  );
  check(
    progress.every((v, i) => i === 0 || v >= progress[i - 1]),
    '진행률이 뒤로 가지 않는다',
  );
  check(r.id === 'VIDEO123', `업로드 결과를 돌려준다 (id=${r.id})`);
} catch (e) {
  failed++;
  console.log(`\n❌ 업로드가 실패했다 — ${e.message}`);
}

server.close();

/* ── 재시도 ────────────────────────────────────────────────
 * 업로드 도중 끊기는 일은 흔하다. 한 번 끊겼다고 포기하면 안 되고,
 * 반대로 할당량 초과처럼 다시 보내도 똑같이 실패하는 건 재시도하면 안 된다
 * (업로드 1건에 1600 units 라 할당량만 태운다).
 */
const retryTest = async () => {
  let puts = 0;
  const srv = http.createServer((req, res) => {
    if (req.method === 'PUT') {
      puts++;
      if (puts === 1) return req.socket.destroy(); // 첫 번째는 도중에 끊는다
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'RETRIED', status: { privacyStatus: 'private' } }));
      });
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/json',
      Location: `http://127.0.0.1:${srv.address().port}/session`,
    });
    res.end('{}');
  });
  await new Promise((r) => srv.listen(0, r));
  const b = `http://127.0.0.1:${srv.address().port}/`;
  globalThis.fetch = (url, opts) => {
    const u = String(url);
    if (u.includes('oauth2.googleapis.com')) {
      return Promise.resolve({ ok: true, json: async () => ({ access_token: 'tok' }) });
    }
    if (u.includes('googleapis.com/upload')) return realFetch(b, opts);
    return realFetch(url, opts);
  };

  console.log('\n중간에 끊겼을 때');
  try {
    const r = await yt.upload({ filePath: video, meta: { title: 't' }, mode: 'private' });
    check(r.id === 'RETRIED', `다시 시도해서 올라갔다 (PUT ${puts}번)`);
  } catch (e) {
    check(false, `재시도했어야 하는데 실패했다 — ${e.message.split('\n')[0]}`);
  }
  srv.close();
};

const noRetryTest = async () => {
  let puts = 0;
  const srv = http.createServer((req, res) => {
    if (req.method === 'PUT') {
      puts++;
      req.resume();
      req.on('end', () => {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 403, message: 'quota', errors: [{ reason: 'quotaExceeded' }] } }));
      });
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/json',
      Location: `http://127.0.0.1:${srv.address().port}/session`,
    });
    res.end('{}');
  });
  await new Promise((r) => srv.listen(0, r));
  const b = `http://127.0.0.1:${srv.address().port}/`;
  globalThis.fetch = (url, opts) => {
    const u = String(url);
    if (u.includes('oauth2.googleapis.com')) {
      return Promise.resolve({ ok: true, json: async () => ({ access_token: 'tok' }) });
    }
    if (u.includes('googleapis.com/upload')) return realFetch(b, opts);
    return realFetch(url, opts);
  };

  console.log('\n할당량 초과일 때 (재시도하면 안 된다)');
  try {
    await yt.upload({ filePath: video, meta: { title: 't' }, mode: 'private' });
    check(false, '오류가 나야 하는데 성공했다');
  } catch (e) {
    check(puts === 1, `한 번만 보내고 포기한다 (PUT ${puts}번)`);
    check(/할당량/.test(e.message), '할당량 안내가 나온다');
  }
  srv.close();
};

await retryTest();
await noRetryTest();
console.log(failed ? `\n❌ ${failed}개 실패\n` : '\n✅ 전부 통과\n');
process.exit(failed ? 1 : 0);
