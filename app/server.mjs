/**
 * 쇼츠 제작 UI 서버.
 *
 *   npm start  →  http://localhost:4321
 *
 * 브라우저에서 원문 붙여넣기 → 대본 생성 → 확인/편집 → 녹음 → 미리듣기 → 최종 출력까지
 * 전부 처리한다. 외부 API 키는 쓰지 않는다.
 *
 * 대본 생성은 설치돼 있는 Claude Code CLI(`claude -p`)를 호출한다.
 * CLI가 없으면 UI가 "지시문 복사 → 클로드에 붙여넣기 → 결과 JSON 붙여넣기" 방식으로 넘어간다.
 */
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrompt } from './prompt.mjs';
import { findBrowser } from '../scripts/find-browser.mjs';
import { setupFonts } from '../scripts/setup-fonts.mjs';

const root = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const PUBLIC_DIR = join(root, 'app', 'public');
const CLIPS_DIR = join(root, 'app', 'data', 'clips');
const AUDIO_DIR = join(root, 'public', 'audio');
const OUTPUT_DIR = join(root, 'output');
const SCRIPT_PATH = join(root, 'src', 'script.json');
const SOURCE_DIR = join(root, '.source');

const PORT = Number(process.env.PORT ?? 4321);
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

for (const dir of [CLIPS_DIR, AUDIO_DIR, OUTPUT_DIR, SOURCE_DIR]) mkdirSync(dir, { recursive: true });
setupFonts({ silent: true });

/* ── 유틸 ────────────────────────────────────────────────── */

const json = (res, code, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
};

const readBody = (req, limit = 80 * 1024 * 1024) =>
  new Promise((ok, fail) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        fail(new Error('요청이 너무 큽니다'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => ok(Buffer.concat(chunks)));
    req.on('error', fail);
  });

const loadScript = () => (existsSync(SCRIPT_PATH) ? JSON.parse(readFileSync(SCRIPT_PATH, 'utf8')) : null);
const saveScript = (data) => writeFileSync(SCRIPT_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');

/**
 * remotion에 딸려오는 ffmpeg/ffprobe를 쓴다 — 따로 설치할 게 없다.
 * `npx remotion ffmpeg` 는 호출마다 1.4초쯤 걸려서, 바이너리를 직접 찾아 쓴다.
 * 못 찾으면 npx 로 넘어간다.
 */
const ffBinary = (() => {
  const cache = {};
  return (tool) => {
    if (cache[tool] !== undefined) return cache[tool];
    const dir = join(root, 'node_modules', '@remotion');
    const exe = process.platform === 'win32' ? '.exe' : '';
    let found = null;
    try {
      for (const name of readdirSync(dir)) {
        if (!name.startsWith('compositor-')) continue;
        const candidate = join(dir, name, tool + exe);
        if (existsSync(candidate)) {
          found = candidate;
          break;
        }
      }
    } catch {
      /* node_modules 구조가 다르면 npx 로 */
    }
    cache[tool] = found;
    return found;
  };
})();

const runFfmpeg = (args, tool = 'ffmpeg') =>
  new Promise((ok, fail) => {
    const bin = ffBinary(tool);
    const p = bin
      ? spawn(bin, args, { cwd: root })
      : spawn(npx, ['remotion', tool, ...args], { cwd: root });
    let err = '';
    let out = '';
    p.stderr.on('data', (d) => (err += d.toString()));
    p.stdout.on('data', (d) => (out += d.toString()));
    p.on('close', (code) => (code === 0 ? ok({ out, err }) : fail(new Error(err.slice(-800)))));
    p.on('error', fail);
  });

const probeDuration = async (file) => {
  const { out } = await runFfmpeg(
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
    'ffprobe',
  );
  return Number(out.trim()) || 0;
};

/**
 * 녹음 길이를 캐시해둔다.
 * 카드마다 ffprobe 를 새로 돌리면 목록을 여는 데만 몇 초씩 걸린다.
 */
const META_PATH = join(CLIPS_DIR, 'meta.json');
const readMeta = () => {
  try {
    return JSON.parse(readFileSync(META_PATH, 'utf8'));
  } catch {
    return {};
  }
};
const writeMeta = (meta) => writeFileSync(META_PATH, JSON.stringify(meta), 'utf8');

const hasClaudeCli = () => {
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], {
    encoding: 'utf8',
  });
  return probe.status === 0 && Boolean(probe.stdout.trim());
};

/** 모델이 코드펜스나 잡담을 섞어 보내도 JSON만 뽑아낸다 */
const extractJson = (text) => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('응답에서 JSON을 찾지 못했습니다.');
  return JSON.parse(candidate.slice(start, end + 1));
};

/**
 * 녹음들을 하나의 내레이션 트랙으로 합친다.
 * 각 카드 길이를 그 카드 녹음 길이에 맞춰 다시 잡기 때문에 음성과 화면이 정확히 붙는다.
 * 렌더 직전에도 한 번 더 부르기 때문에, 녹음을 고치고 바로 렌더해도 어긋나지 않는다.
 */
const buildAudio = async () => {
  const script = loadScript();
  if (!script) throw new Error('대본이 없습니다.');

  const meta = readMeta();
  const TAIL = 0.4; // 말이 끝나고 다음 카드로 넘어가기 전 여유
  const parts = [];
  let recorded = 0;

  for (let i = 0; i < script.cards.length; i++) {
    const clip = join(CLIPS_DIR, `card-${i}.wav`);
    const padded = join(CLIPS_DIR, `part-${i}.wav`);
    let dur;
    if (existsSync(clip)) {
      const d = meta[i] ?? (await probeDuration(clip));
      dur = Math.max(Math.round((d + TAIL) * 10) / 10, 2);
      // 녹음 뒤에 무음을 붙여 카드 길이에 정확히 맞춘다
      await runFfmpeg(['-y', '-i', clip, '-af', 'apad', '-t', String(dur), '-ar', '48000', '-ac', '1', padded]);
      recorded += 1;
    } else {
      // 녹음이 없는 카드는 기존 길이만큼 무음
      dur = Math.max(Number(script.cards[i].durationSec) || 3, 2);
      await runFfmpeg(['-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', String(dur), padded]);
    }
    script.cards[i].durationSec = dur;
    parts.push(padded);
  }

  if (recorded === 0) {
    // 녹음이 하나도 없으면 무음 트랙을 붙이지 않는다
    delete script.narrationAudio;
    saveScript(script);
    const total = script.cards.reduce((a, c) => a + c.durationSec, 0);
    return { recorded: 0, totalSec: Math.round(total * 10) / 10, url: null };
  }

  const listFile = join(CLIPS_DIR, 'concat.txt');
  writeFileSync(listFile, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
  const outMp3 = join(AUDIO_DIR, 'narration.mp3');
  await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-b:a', '160k', outMp3]);

  script.narrationAudio = 'audio/narration.mp3';
  saveScript(script);

  const total = script.cards.reduce((a, c) => a + c.durationSec, 0);
  return { recorded, totalSec: Math.round(total * 10) / 10, url: `/audio/narration.mp3?t=${Date.now()}` };
};

/* ── 진행 상황 스트림 (SSE) ──────────────────────────────── */

const streams = new Map(); // jobId → res
const sendEvent = (jobId, event, data) => {
  const res = streams.get(jobId);
  if (!res) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};
const endStream = (jobId) => {
  const res = streams.get(jobId);
  if (res) res.end();
  streams.delete(jobId);
};

/* ── 라우트 ──────────────────────────────────────────────── */

const routes = {
  'GET /api/status': async (req, res) => {
    const script = loadScript();
    const clips = existsSync(CLIPS_DIR)
      ? readdirSync(CLIPS_DIR).filter((f) => f.endsWith('.webm'))
      : [];
    json(res, 200, {
      claudeCli: hasClaudeCli(),
      hasScript: Boolean(script),
      cardCount: script?.cards?.length ?? 0,
      recordedCards: clips.length,
      browser: findBrowser() ?? 'auto',
    });
  },

  'GET /api/script': async (req, res) => json(res, 200, loadScript() ?? { cards: [] }),

  'POST /api/script': async (req, res) => {
    const data = JSON.parse((await readBody(req)).toString('utf8'));
    if (!Array.isArray(data.cards)) return json(res, 400, { error: 'cards 배열이 없습니다.' });
    saveScript(data);
    json(res, 200, { ok: true });
  },

  /** 지시문만 돌려준다 — CLI 없이 수동으로 돌릴 때 복사해서 쓴다 */
  'POST /api/prompt': async (req, res) => {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    json(res, 200, { prompt: buildPrompt(body) });
  },

  /** Claude Code CLI 를 호출해 원문을 대본으로 바꾼다 */
  'POST /api/analyze': async (req, res) => {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    if (!body.text?.trim()) return json(res, 400, { error: '원문이 비어 있습니다.' });
    if (!hasClaudeCli()) {
      return json(res, 503, {
        error: 'Claude Code CLI를 찾지 못했습니다. 수동 모드를 쓰세요.',
        manual: true,
      });
    }

    // 원문은 저장소에 올리지 않는 .source/ 에 둔다 (베낀 문장 검사용)
    writeFileSync(join(SOURCE_DIR, 'current.txt'), body.text, 'utf8');

    const prompt = buildPrompt(body);
    const child = spawn('claude', ['-p', '--output-format', 'text'], { cwd: root });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));
    child.stdin.write(prompt);
    child.stdin.end();

    const timer = setTimeout(() => child.kill(), 6 * 60 * 1000);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return json(res, 500, { error: `분석 실패 (code ${code})\n${err.slice(-600)}` });
      }
      try {
        const script = extractJson(out);
        saveScript(script);
        json(res, 200, { script });
      } catch (e) {
        json(res, 500, { error: `대본 파싱 실패: ${e.message}`, raw: out.slice(0, 2000) });
      }
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      json(res, 500, { error: e.message });
    });
  },

  /** 수동 모드: 붙여넣은 JSON을 저장 */
  'POST /api/script/paste': async (req, res) => {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    try {
      const script = extractJson(body.raw ?? '');
      if (!Array.isArray(script.cards)) throw new Error('cards 배열이 없습니다.');
      if (body.sourceText) writeFileSync(join(SOURCE_DIR, 'current.txt'), body.sourceText, 'utf8');
      saveScript(script);
      json(res, 200, { script });
    } catch (e) {
      json(res, 400, { error: e.message });
    }
  },

  /** 카드 한 장 미리보기 PNG */
  'POST /api/preview': async (req, res) => {
    const { index = 0 } = JSON.parse((await readBody(req)).toString('utf8'));
    const script = loadScript();
    if (!script) return json(res, 400, { error: '대본이 없습니다.' });

    // 해당 카드의 중간 지점 프레임을 고른다 (애니메이션이 다 끝난 시점)
    const fps = 30;
    let frame = 0;
    for (let i = 0; i < index; i++) frame += Math.round((script.cards[i]?.durationSec ?? 0) * fps);
    frame += Math.round((script.cards[index]?.durationSec ?? 3) * fps * 0.8);

    const file = `preview-${index}-${Date.now()}.png`;
    const browser = findBrowser();
    const args = [
      'remotion',
      'still',
      'CardNews',
      join('app', 'data', file),
      `--frame=${frame}`,
      ...(browser ? [`--browser-executable=${browser}`] : []),
    ];
    const p = spawn(npx, args, { cwd: root });
    let err = '';
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('close', (code) => {
      if (code !== 0) return json(res, 500, { error: err.slice(-600) });
      json(res, 200, { url: `/data/${file}` });
    });
  },

  /** 카드별 녹음 업로드 (raw body, ?index=N) */
  'POST /api/clip': async (req, res, url) => {
    const index = Number(url.searchParams.get('index'));
    if (!Number.isInteger(index) || index < 0) return json(res, 400, { error: 'index 오류' });
    const buf = await readBody(req);
    if (!buf.length) return json(res, 400, { error: '빈 녹음입니다.' });

    const file = join(CLIPS_DIR, `card-${index}.webm`);
    writeFileSync(file, buf);
    try {
      // 브라우저 MediaRecorder 결과는 길이 정보가 빠져 있을 때가 있어 한 번 다시 감싼다
      const fixed = join(CLIPS_DIR, `card-${index}.wav`);
      await runFfmpeg(['-y', '-i', file, '-ar', '48000', '-ac', '1', fixed]);
      const duration = await probeDuration(fixed);
      const meta = readMeta();
      meta[index] = duration;
      writeMeta(meta);
      json(res, 200, { duration, url: `/clip/${index}?t=${Date.now()}` });
    } catch (e) {
      json(res, 500, { error: e.message });
    }
  },

  'DELETE /api/clip': async (req, res, url) => {
    const index = Number(url.searchParams.get('index'));
    for (const ext of ['webm', 'wav']) {
      const f = join(CLIPS_DIR, `card-${index}.${ext}`);
      if (existsSync(f)) rmSync(f);
    }
    const meta = readMeta();
    delete meta[index];
    writeMeta(meta);
    json(res, 200, { ok: true });
  },

  'GET /api/clips': async (req, res) => {
    const script = loadScript();
    const total = script?.cards?.length ?? 0;
    const meta = readMeta();
    let dirty = false;
    const list = [];
    for (let i = 0; i < total; i++) {
      const f = join(CLIPS_DIR, `card-${i}.wav`);
      if (!existsSync(f)) {
        if (meta[i] !== undefined) {
          delete meta[i];
          dirty = true;
        }
        list.push({ index: i, duration: 0 });
        continue;
      }
      if (meta[i] === undefined) {
        meta[i] = await probeDuration(f);
        dirty = true;
      }
      list.push({ index: i, duration: meta[i] });
    }
    if (dirty) writeMeta(meta);
    json(res, 200, { clips: list });
  },

  /**
   * 녹음들을 하나의 내레이션 트랙으로 합친다.
   * 각 카드 길이를 그 카드 녹음 길이에 맞춰 다시 잡기 때문에 음성과 화면이 정확히 붙는다.
   */
  'POST /api/audio/build': async (req, res) => {
    try {
      const r = await buildAudio();
      json(res, 200, { ok: true, ...r });
    } catch (e) {
      json(res, 500, { error: e.message });
    }
  },

  /** 최종 렌더링 — 진행률은 SSE로 흘려보낸다 */
  'POST /api/render': async (req, res) => {
    if (!loadScript()) return json(res, 400, { error: '대본이 없습니다.' });

    // 녹음을 고친 뒤 바로 렌더를 눌러도 어긋나지 않도록 항상 다시 합친다
    try {
      await buildAudio();
    } catch (e) {
      return json(res, 500, { error: `내레이션 합치기 실패: ${e.message}` });
    }
    const script = loadScript();

    const jobId = String(Date.now());
    json(res, 200, { jobId });

    setTimeout(() => {
      const slug = String(script.topic ?? '')
        .replace(/[\\/:*?"<>|\s]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40);
      const pad = (n) => String(n).padStart(2, '0');
      const d = new Date();
      const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      const fileName = `쇼츠_${slug || '무제'}_${stamp}.mp4`;
      const browser = findBrowser();

      const p = spawn(
        npx,
        [
          'remotion', 'render', 'CardNews', join('output', fileName),
          ...(browser ? [`--browser-executable=${browser}`] : []),
        ],
        { cwd: root },
      );

      const onData = (d) => {
        const text = d.toString();
        const m = [...text.matchAll(/(Rendered|Encoded)\s+(\d+)\/(\d+)/g)].pop();
        if (m) {
          sendEvent(jobId, 'progress', {
            phase: m[1] === 'Rendered' ? '프레임 그리는 중' : '영상 인코딩 중',
            done: Number(m[2]),
            total: Number(m[3]),
          });
        }
      };
      p.stdout.on('data', onData);
      p.stderr.on('data', onData);

      p.on('close', (code) => {
        if (code === 0) {
          sendEvent(jobId, 'done', { file: fileName, url: `/output/${encodeURIComponent(fileName)}` });
        } else {
          sendEvent(jobId, 'error', { message: `렌더링 실패 (code ${code})` });
        }
        endStream(jobId);
      });
    }, 30);
  },

  'GET /api/render/stream': async (req, res, url) => {
    const jobId = url.searchParams.get('job');
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('retry: 2000\n\n');
    streams.set(jobId, res);
    req.on('close', () => streams.delete(jobId));
  },
};

/* ── 정적 파일 ───────────────────────────────────────────── */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
};

const serveFile = (res, file, download = false) => {
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end('not found');
    return;
  }
  const headers = { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' };
  if (download) {
    headers['Content-Disposition'] =
      `attachment; filename*=UTF-8''${encodeURIComponent(file.split(/[\\/]/).pop())}`;
  }
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
};

/* ── 서버 ────────────────────────────────────────────────── */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const key = `${req.method} ${url.pathname}`;

  try {
    if (routes[key]) return await routes[key](req, res, url);

    // 정적 자원
    if (url.pathname === '/') return serveFile(res, join(PUBLIC_DIR, 'index.html'));
    if (url.pathname.startsWith('/data/')) {
      return serveFile(res, join(root, 'app', 'data', url.pathname.slice(6)));
    }
    if (url.pathname.startsWith('/clip/')) {
      return serveFile(res, join(CLIPS_DIR, `card-${Number(url.pathname.slice(6))}.wav`));
    }
    if (url.pathname.startsWith('/audio/')) {
      return serveFile(res, join(AUDIO_DIR, url.pathname.slice(7)));
    }
    if (url.pathname.startsWith('/output/')) {
      return serveFile(res, join(OUTPUT_DIR, decodeURIComponent(url.pathname.slice(8))), true);
    }
    const candidate = join(PUBLIC_DIR, url.pathname.replace(/^\/+/, ''));
    if (candidate.startsWith(PUBLIC_DIR)) return serveFile(res, candidate);

    res.writeHead(404).end('not found');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: e.message });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  🎬  쇼츠 제작 스튜디오');
  console.log(`      http://localhost:${PORT}`);
  console.log('');
  console.log(`      대본 생성: ${hasClaudeCli() ? 'Claude Code CLI 사용 가능' : '수동 모드 (CLI 없음)'}`);
  console.log('      종료: Ctrl+C');
  console.log('');
});
