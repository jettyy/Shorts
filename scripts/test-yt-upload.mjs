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

/* ── 끊겼는데 사실은 올라가 있었을 때 ─────────────────────
 *
 * resumable 업로드는 **본문이 다 도착한 뒤에도 응답을 못 받는 일**이 있다.
 * 예전에는 그럴 때 처음부터 다시 올렸고, 그러면 새 세션이 열려서
 * 같은 영상이 채널에 두 개 생겼다(할당량도 두 배로 나갔다).
 * 실제로 사용자 채널에 똑같은 영상이 두 개 올라갔다.
 *
 * 지금은 같은 세션에 "얼마나 받았냐"고 물어보고, 다 받았으면 성공으로 처리한다.
 */
const resumeTest = async () => {
  let sessions = 0;
  let bodyPuts = 0;
  const srv = http.createServer((req, res) => {
    if (req.method === 'PUT') {
      // 본문 없이 오는 PUT = 세션 상태 문의 (Content-Range: bytes * /크기)
      const range = req.headers['content-range'];
      if (range) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'ALREADY', status: { privacyStatus: 'private' } }));
        return;
      }
      bodyPuts++;
      // 본문은 다 받되 응답은 안 주고 끊는다 (유튜브 쪽엔 올라간 상태)
      req.resume();
      req.on('end', () => req.socket.destroy());
      return;
    }
    sessions++;
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

  console.log('\n응답만 못 받았을 때 (이미 올라가 있다)');
  try {
    const r = await yt.upload({ filePath: video, meta: { title: 't' }, mode: 'private' });
    check(r.id === 'ALREADY', '올라간 영상을 찾아서 성공으로 처리한다');
    check(sessions === 1, `업로드 세션을 한 번만 연다 — 두 번 올리지 않는다 (${sessions}번)`);
    check(bodyPuts === 1, `본문도 한 번만 보낸다 (${bodyPuts}번)`);
  } catch (e) {
    check(false, `올라가 있는데 실패로 처리했다 — ${e.message.split('\n')[0]}`);
  }
  srv.close();
};

/** 정말 안 올라갔으면(308) 성공이라고 우기면 안 된다 */
const notUploadedTest = async () => {
  let sessions = 0;
  const srv = http.createServer((req, res) => {
    if (req.method === 'PUT') {
      if (req.headers['content-range']) {
        res.writeHead(308, { Range: 'bytes=0-1023' }); // 아직 덜 받았다
        res.end();
        return;
      }
      req.resume();
      req.on('end', () => req.socket.destroy());
      return;
    }
    sessions++;
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

  console.log('\n정말 안 올라갔을 때');
  try {
    await yt.upload({ filePath: video, meta: { title: 't' }, mode: 'private' });
    check(false, '실패해야 하는데 성공으로 처리했다');
  } catch (e) {
    check(/끊겼습니다/.test(e.message), '실패했다고 알려준다');
    check(sessions === 1, `그래도 두 번 올리지는 않는다 (세션 ${sessions}번)`);
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

await resumeTest();
await notUploadedTest();
await noRetryTest();
await causeTest();
console.log(failed ? `\n❌ ${failed}개 실패\n` : '\n✅ 전부 통과\n');
process.exit(failed ? 1 : 0);
