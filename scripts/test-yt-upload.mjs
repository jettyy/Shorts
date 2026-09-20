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

/* ── 예약·공개는 업로드와 분리한다 ────────────────────────
 *
 * 예전에는 업로드를 시작할 때 privacyStatus/publishAt 을 같이 보냈다. 그러면
 * 공개·예약이 거절될 때 **다 보낸 업로드가 통째로 날아간다**(1600 units 도 같이).
 * 실제로 비공개는 올라가는데 공개·예약만 "fetch failed" 로 죽는 일이 있었다.
 *
 * 그래서 본문은 언제나 비공개로 올리고, 공개·예약은 videos.update 로 따로 건다.
 * 아래 테스트가 그 구조를 지킨다.
 */

/** 가짜 유튜브 — 업로드 세션·본문·videos.update 를 모두 받는다 */
const fakeYouTube = async ({ updateStatus = 200, updateBody = null } = {}) => {
  const seen = { insert: null, update: null, updates: 0 };
  const srv = http.createServer((req, res) => {
    if (req.url.startsWith('/videos')) {
      // videos.update — 공개 설정 걸기
      seen.updates++;
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        seen.update = { method: req.method, body: JSON.parse(raw || '{}') };
        res.writeHead(updateStatus, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify(
            updateBody ?? { id: 'VIDEO123', status: JSON.parse(raw).status },
          ),
        );
      });
      return;
    }
    if (req.method === 'PUT') {
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'VIDEO123', status: { privacyStatus: 'private' } }));
      });
      return;
    }
    // 업로드 세션 시작 — 여기 실린 메타데이터를 들여다본다
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      seen.insert = JSON.parse(raw || '{}');
      res.writeHead(200, {
        'Content-Type': 'application/json',
        Location: `http://127.0.0.1:${srv.address().port}/session`,
      });
      res.end('{}');
    });
  });
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  globalThis.fetch = (url, opts) => {
    const u = String(url);
    if (u.includes('oauth2.googleapis.com')) {
      return Promise.resolve({ ok: true, json: async () => ({ access_token: 'tok' }) });
    }
    if (u.includes('googleapis.com/upload')) return realFetch(`http://127.0.0.1:${port}/`, opts);
    if (u.includes('youtube/v3/videos')) {
      return realFetch(`http://127.0.0.1:${port}/videos?part=status`, opts);
    }
    return realFetch(url, opts);
  };
  return { seen, close: () => srv.close() };
};

const scheduleTest = async () => {
  const { seen, close } = await fakeYouTube();
  const at = new Date(Date.now() + 4 * 3600_000).toISOString();

  console.log('\n예약 발행');
  const r = await yt.upload({
    filePath: video,
    meta: { title: 't' },
    mode: 'schedule',
    publishAt: at,
  });
  check(
    seen.insert?.status?.privacyStatus === 'private',
    `본문은 비공개로 올린다 (${seen.insert?.status?.privacyStatus})`,
  );
  check(
    !('publishAt' in (seen.insert?.status ?? {})),
    '업로드 요청에는 예약 시각을 싣지 않는다',
  );
  check(seen.update?.method === 'PUT', 'videos.update 로 예약을 따로 건다');
  check(seen.update?.body?.id === 'VIDEO123', '방금 올린 영상에 건다');
  check(seen.update?.body?.status?.publishAt === at, `예약 시각이 그대로 전달된다`);
  check(
    seen.update?.body?.status?.privacyStatus === 'private',
    '예약은 비공개 + publishAt 이어야 한다',
  );
  check(r.publishAt === at, '결과에 공개 예정 시각이 담긴다');
  check(!r.warning, '경고 없이 끝난다');
  close();
};

const publicTest = async () => {
  const { seen, close } = await fakeYouTube();
  console.log('\n바로 발행');
  const r = await yt.upload({ filePath: video, meta: { title: 't' }, mode: 'public' });
  check(seen.insert?.status?.privacyStatus === 'private', '본문은 비공개로 올린다');
  check(seen.update?.body?.status?.privacyStatus === 'public', '올린 뒤 공개로 바꾼다');
  check(r.privacyStatus === 'public', `결과 상태가 public (${r.privacyStatus})`);
  close();
};

const privateTest = async () => {
  const { seen, close } = await fakeYouTube();
  console.log('\n비공개로만 올리기');
  await yt.upload({ filePath: video, meta: { title: 't' }, mode: 'private' });
  check(seen.updates === 0, `쓸데없는 요청을 보내지 않는다 (update ${seen.updates}회)`);
  close();
};

/** 공개 설정이 실패해도 **영상은 이미 올라가 있다** — 그 사실을 잃어버리면 안 된다 */
const statusFailTest = async () => {
  const { seen, close } = await fakeYouTube({
    updateStatus: 403,
    updateBody: {
      error: {
        code: 403,
        message: 'Request had insufficient authentication scopes.',
        errors: [{ reason: 'insufficientPermissions' }],
      },
    },
  });

  console.log('\n예약을 걸 권한이 없을 때');
  try {
    const r = await yt.upload({
      filePath: video,
      meta: { title: 't' },
      mode: 'schedule',
      publishAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
    });
    check(r.id === 'VIDEO123', '올라간 영상 정보를 그대로 돌려준다');
    check(Boolean(r.url) && Boolean(r.studioUrl), '스튜디오 링크가 있어서 직접 고칠 수 있다');
    check(r.privacyStatus === 'private', `비공개로 남는다 (${r.privacyStatus})`);
    check(/다시 연결/.test(r.warning ?? ''), '다시 연결하라고 알려준다');
    check(seen.updates === 1, `권한 문제는 다시 시도하지 않는다 (update ${seen.updates}회)`);
  } catch (e) {
    check(false, `업로드가 살아 있어야 하는데 통째로 실패했다 — ${e.message.split('\n')[0]}`);
  }
  close();
};

/**
 * 끝내 실패했을 때 **진짜 원인이 화면까지 나와야 한다.**
 *
 * Node 의 fetch 는 무슨 일이 있어도 메시지가 "fetch failed" 한 줄이라,
 * 원인(error.cause)을 꺼내주지 않으면 사용자도 우리도 아무 단서를 못 얻는다.
 * 실제로 "fetch failed" 만 보고 공개 설정 문제로 오해한 적이 있다.
 */
const causeTest = async () => {
  const srv = http.createServer((req, res) => {
    if (req.method === 'PUT') return req.socket.destroy(); // 매번 끊는다
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

  console.log('\n끝내 실패했을 때 원인이 남는가');
  try {
    await yt.upload({ filePath: video, meta: { title: 't' }, mode: 'private' });
    check(false, '실패해야 하는데 성공했다');
  } catch (e) {
    check(/원인:/.test(e.message), '"원인:" 줄이 붙는다');
    check(
      !/^fetch failed$/m.test(e.message) && e.message.length > 'fetch failed'.length,
      `"fetch failed" 한 줄로 끝나지 않는다`,
    );
    check(/어느 단계|올리는 중|시작하는 중/.test(e.message), '어느 단계에서 끊겼는지 알려준다');
    console.log(`     ↳ ${e.message.split('\n').slice(0, 2).join(' / ')}`);
  }
  srv.close();
};

await retryTest();
await noRetryTest();
await causeTest();
await scheduleTest();
await publicTest();
await privateTest();
await statusFailTest();
console.log(failed ? `\n❌ ${failed}개 실패\n` : '\n✅ 전부 통과\n');
process.exit(failed ? 1 : 0);
