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

/**
 * Remotion CLI 진입점.
 *
 * `npx remotion` 을 쓰지 않는다. npx 는 로컬에 없으면 레지스트리에서 받으려다
 * "could not determine executable to run" 같은 엉뚱한 오류를 내고,
 * 윈도우에서는 npx.cmd 실행 문제까지 겹친다.
 * 그냥 설치된 js 파일을 현재 node 로 직접 실행한다.
 */
const remotionCli = () => {
  const entry = join(root, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
  return existsSync(entry) ? entry : null;
};

/** remotion CLI 를 띄운다 (설치 안 돼 있으면 null) */
const spawnRemotion = (args) => {
  const entry = remotionCli();
  if (!entry) return null;
  return spawn(process.execPath, [entry, ...args], { cwd: root });
};

for (const dir of [CLIPS_DIR, AUDIO_DIR, OUTPUT_DIR, SOURCE_DIR]) mkdirSync(dir, { recursive: true });
setupFonts({ silent: true });

/* ── 유틸 ────────────────────────────────────────────────── */

const json = (res, code, body) => {
  if (res.headersSent || res.writableEnded) return; // 응답은 한 번만
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
 * remotion 에 딸려오는 ffmpeg/ffprobe 를 쓴다 — 따로 설치할 게 없다.
 * 플랫폼별 compositor 패키지 안에 바이너리가 들어 있다.
 * (예: @remotion/compositor-darwin-arm64/ffmpeg)
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
      /* node_modules 가 없으면 아래에서 안내 메시지를 낸다 */
    }
    cache[tool] = found;
    return found;
  };
})();

const runFfmpeg = (args, tool = 'ffmpeg') =>
  new Promise((ok, fail) => {
    const bin = ffBinary(tool);
    if (!bin) {
      return fail(
        new Error(
          `${tool} 를 찾지 못했습니다. 프로젝트 폴더에서 npm install 을 실행한 뒤 다시 시도해주세요.`,
        ),
      );
    }
    const p = spawn(bin, args, { cwd: root });
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

/**
 * `claude` 실행 파일의 실제 경로를 찾는다.
 *
 * 윈도우에서 전역 설치된 claude 는 `claude.cmd` 셸 스크립트다.
 * Node 의 spawn 은 shell 옵션 없이 .cmd 를 실행하지 못하고 ENOENT 를 낸다.
 * 그래서 where/which 가 알려주는 실제 경로를 그대로 쓴다.
 */
const findClaudeCli = () => {
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], {
    encoding: 'utf8',
  });
  if (probe.status !== 0) return null;
  const lines = probe.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  if (process.platform !== 'win32') return lines[0];
  // where 는 확장자 없는 셸 스크립트까지 같이 알려준다 — 윈도우가 실행할 수 있는 것을 고른다
  return (
    lines.find((l) => /\.exe$/i.test(l)) ??
    lines.find((l) => /\.(cmd|bat)$/i.test(l)) ??
    lines[0]
  );
};

const hasClaudeCli = () => Boolean(findClaudeCli());

const INSTALL_HINT =
  '필요한 패키지가 설치돼 있지 않습니다.\n' +
  '프로젝트 폴더에서 npm install 을 실행한 뒤 서버를 다시 켜주세요.';

/**
 * 설치 상태 점검.
 *
 * 이 서버는 node 기본 모듈만 쓰기 때문에 npm install 을 안 해도 그냥 켜진다.
 * 그래서 아무 문제 없어 보이다가 렌더링·녹음 합치기 단계에서야 터진다.
 * 시작할 때, 그리고 /api/status 에서 미리 확인해 알려준다.
 */
const checkInstall = () => {
  const missing = [];
  if (!existsSync(join(root, 'node_modules'))) {
    missing.push('node_modules (npm install 을 아직 실행하지 않았습니다)');
    return { ok: false, missing };
  }
  if (!remotionCli()) missing.push('@remotion/cli (영상 렌더링)');
  if (!ffBinary('ffmpeg') || !ffBinary('ffprobe')) {
    missing.push(`@remotion/compositor-* (ffmpeg — ${process.platform}/${process.arch} 용)`);
  }
  if (!existsSync(join(root, 'public', 'fonts', 'Pretendard-Bold.woff2'))) {
    missing.push('public/fonts (한글 폰트 — node scripts/setup-fonts.mjs)');
  }
  return { ok: missing.length === 0, missing };
};



/**
 * claude CLI 를 띄운다.
 *
 * 윈도우에서 전역 설치된 claude 는 `claude.cmd` 배치 파일인데,
 * Node 는 보안 패치 이후 배치 파일을 shell 없이 실행하지 못한다(ENOENT/EINVAL).
 * 그래서 배치 파일이면 shell 을 거치고, 그래도 실패하면 한 번 더 shell 로 재시도한다.
 * (프롬프트는 stdin 으로 넘기므로 셸에 문자열이 섞일 일은 없다)
 */
const spawnClaude = (cli, useShell) => {
  const args = ['-p', '--output-format', 'text'];
  if (useShell) {
    // 경로에 공백이 있을 수 있어 따옴표로 감싼다 (예: C:\\Program Files\\...)
    return spawn(`"${cli}"`, args, { cwd: root, shell: true });
  }
  return spawn(cli, args, { cwd: root });
};

/** 처음부터 shell 로 띄워야 하는가 */
const needsShell = (cli) => process.platform === 'win32' && /\.(cmd|bat)$/i.test(cli);

/** spawn 단계에서 난 오류인가 (실행조차 못 한 경우) */
const isSpawnFailure = (code) => ['ENOENT', 'EINVAL', 'EACCES', 'UNKNOWN'].includes(code);

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
/** 클라이언트가 아직 붙기 전에 끝난 작업의 결과를 잠깐 들고 있는다 */
const pending = new Map(); // jobId → [{event, data}]

const sendEvent = (jobId, event, data) => {
  const res = streams.get(jobId);
  if (!res) {
    // 아직 연결 전이면 모아뒀다가 연결되는 순간 흘려보낸다
    if (!pending.has(jobId)) pending.set(jobId, []);
    pending.get(jobId).push({ event, data });
    setTimeout(() => pending.delete(jobId), 60_000);
    return;
  }
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};

const endStream = (jobId) => {
  const res = streams.get(jobId);
  if (res) res.end();
  streams.delete(jobId);
};

const openStream = (res, jobId, req) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');
  streams.set(jobId, res);

  // 연결 전에 쌓인 이벤트가 있으면 지금 내보낸다
  const queued = pending.get(jobId);
  if (queued) {
    pending.delete(jobId);
    for (const { event, data } of queued) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
    if (queued.some((q) => q.event === 'done' || q.event === 'error')) {
      res.end();
      streams.delete(jobId);
      return;
    }
  }
  req.on('close', () => streams.delete(jobId));
};

/* ── 라우트 ──────────────────────────────────────────────── */

const routes = {
  'GET /api/status': async (req, res) => {
    const script = loadScript();
    const clips = existsSync(CLIPS_DIR)
      ? readdirSync(CLIPS_DIR).filter((f) => f.endsWith('.webm'))
      : [];
    json(res, 200, {
      install: checkInstall(),
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

  /**
   * Claude Code CLI 를 호출해 원문을 대본으로 바꾼다.
   *
   * 분석에 1~2분이 걸려서 HTTP 요청을 붙잡고 있으면 중간에 끊기기 쉽다.
   * 그래서 렌더링과 같은 방식으로 jobId 를 먼저 돌려주고 진행 상황은 SSE 로 보낸다.
   */
  'POST /api/analyze': async (req, res) => {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    if (!body.text?.trim()) return json(res, 400, { error: '원문이 비어 있습니다.' });

    const cli = findClaudeCli();
    if (!cli) {
      return json(res, 503, {
        error: 'Claude Code CLI를 찾지 못했습니다. 수동 모드를 쓰세요.',
        manual: true,
      });
    }

    // 원문은 저장소에 올리지 않는 .source/ 에 둔다 (베낀 문장 검사용)
    writeFileSync(join(SOURCE_DIR, 'current.txt'), body.text, 'utf8');

    const jobId = `a${Date.now()}`;
    json(res, 200, { jobId });

    // 클라이언트가 SSE 에 붙을 시간을 준 뒤 시작한다
    setTimeout(() => {
      const prompt = buildPrompt(body);
      console.log(`[분석] 시작 — 원문 ${body.text.length}자, 카드 ${body.cardCount ?? 7}장`);

      const started = Date.now();
      let settled = false;
      let beat;
      let timer;

      const finish = (event, data) => {
        if (settled) return; // error 와 close 가 둘 다 오는 경우가 있다
        settled = true;
        clearTimeout(timer);
        clearInterval(beat);
        sendEvent(jobId, event, data);
        endStream(jobId);
      };

      beat = setInterval(() => {
        sendEvent(jobId, 'progress', { elapsed: Math.round((Date.now() - started) / 1000) });
      }, 2000);

      /** shell 경유 여부를 바꿔가며 최대 두 번 시도한다 */
      const attempt = (useShell) => {
        let child;
        try {
          child = spawnClaude(cli, useShell);
        } catch (e) {
          return onSpawnFail(useShell, e.code ?? 'UNKNOWN', e.message);
        }

        let out = '';
        let err = '';
        let spawnFailed = false;

        child.stdout.on('data', (d) => (out += d.toString()));
        child.stderr.on('data', (d) => (err += d.toString()));

        // 자식이 먼저 죽으면 stdin.write 가 EPIPE 를 던진다
        child.stdin.on('error', () => {});
        try {
          child.stdin.write(prompt);
          child.stdin.end();
        } catch {
          /* 아래 error/close 핸들러가 처리한다 */
        }

        timer = setTimeout(() => {
          child.kill();
          finish('error', {
            message: '분석이 6분을 넘겨 중단했습니다. 원문을 줄여서 다시 시도해보세요.',
          });
        }, 6 * 60 * 1000);

        child.on('error', (e) => {
          if (isSpawnFailure(e.code)) {
            spawnFailed = true;
            return onSpawnFail(useShell, e.code, e.message);
          }
          console.error('[분석] 실행 오류:', e.message);
          finish('error', { message: `claude 실행 오류: ${e.message}` });
        });

        child.on('close', (code) => {
          if (spawnFailed || settled) return; // 이미 error 에서 처리됐다
          if (code !== 0) {
            console.error(`[분석] 실패 code=${code}`, err.slice(-400));
            return finish('error', { message: `분석 실패 (code ${code})\n${err.slice(-400)}` });
          }
          try {
            const script = extractJson(out);
            if (!Array.isArray(script.cards) || !script.cards.length) {
              throw new Error('cards 배열이 비어 있습니다.');
            }
            saveScript(script);
            console.log(`[분석] 완료 — 카드 ${script.cards.length}장`);
            finish('done', { script });
          } catch (e) {
            console.error('[분석] 파싱 실패:', e.message);
            finish('error', { message: `대본 파싱 실패: ${e.message}` });
          }
        });
      };

      const onSpawnFail = (usedShell, code, message) => {
        clearTimeout(timer);
        if (!usedShell) {
          // 윈도우의 claude.cmd 처럼 shell 을 거쳐야 실행되는 경우가 있다
          console.warn(`[분석] 직접 실행 실패(${code}) — shell 로 다시 시도합니다`);
          return attempt(true);
        }
        console.error('[분석] 실행 실패:', code, message);
        finish('error', {
          message:
            `claude 실행 파일을 실행하지 못했습니다 (${code}).\n` +
            `경로: ${cli}\n` +
            '터미널에서 claude --version 이 되는지 확인하거나, 아래 수동 모드를 쓰세요.',
        });
      };

      attempt(needsShell(cli));
    }, 120);
  },

  'GET /api/analyze/stream': async (req, res, url) => {
    openStream(res, url.searchParams.get('job'), req);
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
    const p = spawnRemotion([
      'still',
      'CardNews',
      join('app', 'data', file),
      `--frame=${frame}`,
      ...(browser ? [`--browser-executable=${browser}`] : []),
    ]);
    if (!p) return json(res, 500, { error: INSTALL_HINT });

    let err = '';
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('error', (e) => json(res, 500, { error: e.message }));
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

      const p = spawnRemotion([
        'render', 'CardNews', join('output', fileName),
        ...(browser ? [`--browser-executable=${browser}`] : []),
      ]);
      if (!p) {
        sendEvent(jobId, 'error', { message: INSTALL_HINT });
        return endStream(jobId);
      }
      p.on('error', (e) => {
        sendEvent(jobId, 'error', { message: `렌더링 실행 실패: ${e.message}` });
        endStream(jobId);
      });

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
    openStream(res, url.searchParams.get('job'), req);
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

/**
 * 마지막 안전망.
 * 이벤트 핸들러 안에서 터진 예외는 요청 단위 try/catch 로 잡히지 않아 프로세스를 죽인다.
 * 서버가 죽으면 브라우저에는 "Failed to fetch" 만 보이고 원인을 알 수 없으므로,
 * 여기서 로그만 남기고 계속 살아 있게 한다.
 */
process.on('uncaughtException', (e) => {
  console.error('\n[서버 오류] 처리되지 않은 예외 — 서버는 계속 동작합니다:');
  console.error(e);
});
process.on('unhandledRejection', (e) => {
  console.error('\n[서버 오류] 처리되지 않은 거부:', e);
});

server.listen(PORT, () => {
  console.log('');
  console.log('  🎬  쇼츠 제작 스튜디오');
  console.log(`      http://localhost:${PORT}`);
  console.log('');
  console.log(`      대본 생성: ${hasClaudeCli() ? 'Claude Code CLI 사용 가능' : '수동 모드 (CLI 없음)'}`);
  console.log('      종료: Ctrl+C');
  console.log('');

  const install = checkInstall();
  if (!install.ok) {
    console.log('  ⚠️  설치가 덜 됐습니다 — 영상 렌더링과 녹음 합치기가 동작하지 않습니다.');
    for (const m of install.missing) console.log(`      · 없음: ${m}`);
    console.log('');
    console.log('      해결: 이 폴더에서 아래를 실행한 뒤 npm start 를 다시 하세요.');
    console.log('        npm install');
    console.log('');
  }
});
