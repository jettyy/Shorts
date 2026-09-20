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
import { homedir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrompt } from './prompt.mjs';
import { withPublishCopy } from './publish-copy.mjs';
import { createYouTube } from './youtube.mjs';
import { BGM_PRESETS, renderBgm } from './bgm.mjs';
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
const youtube = createYouTube(join(root, 'app', 'data'));
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
    /**
     * ffmpeg 가 쓰는 공유 라이브러리(libavcodec 등)는 바이너리 바로 옆에 들어 있다.
     * 그런데 macOS 빌드는 이를 'libavdevice.dylib' 처럼 경로 없이 참조해서,
     * dyld 가 현재 작업 디렉터리를 기준으로 찾는다.
     * 프로젝트 루트에서 실행하면 "Library not loaded: libavdevice.dylib" 로 죽는다.
     * → 바이너리가 있는 폴더에서 실행하고, 라이브러리 경로도 같이 알려준다.
     *   (ffmpeg 에 넘기는 파일 경로는 전부 절대 경로라 작업 디렉터리를 바꿔도 안전하다)
     */
    const binDir = dirname(bin);
    const p = spawn(bin, args, {
      cwd: binDir,
      env: {
        ...process.env,
        DYLD_LIBRARY_PATH: [binDir, process.env.DYLD_LIBRARY_PATH].filter(Boolean).join(':'),
        DYLD_FALLBACK_LIBRARY_PATH: [binDir, process.env.DYLD_FALLBACK_LIBRARY_PATH]
          .filter(Boolean)
          .join(':'),
        LD_LIBRARY_PATH: [binDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
      },
    });
    const errChunks = [];
    const outChunks = [];
    p.stderr.on('data', (d) => errChunks.push(d));
    p.stdout.on('data', (d) => outChunks.push(d));
    p.on('close', (code) => {
      const out = decodeOut(Buffer.concat(outChunks));
      const err = decodeOut(Buffer.concat(errChunks));
      if (code === 0) ok({ out, err });
      else fail(new Error(err.slice(-800) || `${tool} 실패 (code ${code})`));
    });
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

// 예전 meta.json 은 길이만 숫자로 담았다. 두 형식을 모두 읽는다.
const metaDuration = (entry) => (typeof entry === 'number' ? entry : entry?.duration);
const metaLoudness = (entry) => (typeof entry === 'number' ? undefined : entry?.loudness);

/**
 * 음량 측정 (loudnorm 1차 패스).
 *
 * 카드마다 녹음 음량이 제각각이면 이어 붙였을 때 커졌다 작아졌다 한다.
 * 먼저 재본 값을 가지고 2차 패스에서 일정한 이득만 걸어주면
 * 음량이 출렁이지 않고 평평하게 맞는다.
 */
const measureLoudness = async (file) => {
  const { err } = await runFfmpeg([
    '-hide_banner', '-i', file,
    '-af', `loudnorm=I=${LOUDNESS_TARGET}:TP=${LOUDNESS_PEAK}:LRA=11:print_format=json`,
    '-f', 'null', '-',
  ]);
  const blocks = err.match(/\{[^{}]*"input_i"[\s\S]*?\}/g);
  if (!blocks?.length) return null;
  try {
    const m = JSON.parse(blocks[blocks.length - 1]);
    const i = Number(m.input_i);
    // 거의 무음인 클립까지 끌어올리면 잡음만 커진다
    if (!Number.isFinite(i) || i < -50) return null;
    return {
      i: m.input_i,
      tp: m.input_tp,
      lra: m.input_lra,
      thresh: m.input_thresh,
      offset: m.target_offset,
    };
  } catch {
    return null;
  }
};

/** 온라인 영상 내레이션에 무난한 값 */
const LOUDNESS_TARGET = -16;
const LOUDNESS_PEAK = -1.5;

/** 2차 패스 필터 — 측정값이 없으면 음량은 건드리지 않는다 */
const loudnormFilter = (n) =>
  n
    ? `loudnorm=I=${LOUDNESS_TARGET}:TP=${LOUDNESS_PEAK}:LRA=11:` +
      `measured_I=${n.i}:measured_TP=${n.tp}:measured_LRA=${n.lra}:` +
      `measured_thresh=${n.thresh}:offset=${n.offset}:linear=true`
    : null;

/**
 * `claude` 실행 파일의 실제 경로를 찾는다.
 *
 * 윈도우에서 전역 설치된 claude 는 `claude.cmd` 셸 스크립트다.
 * Node 의 spawn 은 shell 옵션 없이 .cmd 를 실행하지 못하고 ENOENT 를 낸다.
 * 그래서 where/which 가 알려주는 실제 경로를 그대로 쓴다.
 */
/**
 * 자식 프로세스 출력 디코딩.
 *
 * 윈도우 콘솔 프로그램은 UTF-8 이 아니라 시스템 코드 페이지로 출력한다.
 * (한국어 윈도우면 CP949) 그대로 UTF-8 로 읽으면 글자가 깨져서
 * 정작 중요한 오류 메시지를 못 읽는다.
 */
const decodeOut = (buf) => {
  if (!buf?.length) return '';
  const utf8 = buf.toString('utf8');
  if (!utf8.includes('\uFFFD')) return utf8;
  for (const enc of ['euc-kr', 'gbk', 'shift_jis', 'windows-1252']) {
    try {
      const text = new TextDecoder(enc).decode(buf);
      if (!text.includes('\uFFFD')) return text;
    } catch {
      /* 이 인코딩을 지원하지 않으면 다음 것으로 */
    }
  }
  return utf8;
};

/**
 * claude 실행 파일 찾기.
 *
 * where/which 를 쓰지 않는다. 윈도우의 where 는 시스템 코드 페이지로 경로를 출력해서,
 * 사용자 이름에 한글이 들어가면(C:\Users\정대진\...) 읽는 쪽에서 깨진다.
 * 깨진 경로로 실행하면 "지정된 경로를 찾을 수 없습니다" 가 난다.
 * PATH 환경변수는 Node 가 제대로 된 문자열로 주므로 직접 훑는다.
 */
const findClaudeCli = () => {
  const isWin = process.platform === 'win32';
  const exts = isWin ? ['.exe', '.cmd', '.bat', ''] : [''];
  const sep = isWin ? ';' : ':';

  const fromPath = (process.env.PATH ?? '')
    .split(sep)
    .map((d) => d.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);

  // PATH 에 안 잡혀도 흔히 설치되는 자리들
  const extra = isWin
    ? [
        join(homedir(), '.local', 'bin'),
        join(process.env.APPDATA ?? '', 'npm'),
        join(process.env.LOCALAPPDATA ?? '', 'Programs', 'claude'),
      ]
    : [
        join(homedir(), '.local', 'bin'),
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/usr/bin',
      ];

  for (const dir of [...fromPath, ...extra]) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, `claude${ext}`);
      try {
        if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
      } catch {
        /* 접근할 수 없는 경로는 건너뛴다 */
      }
    }
  }
  return null;
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

  const ff = ffBinary('ffmpeg');
  if (!ff || !ffBinary('ffprobe')) {
    missing.push(`@remotion/compositor-* (ffmpeg — ${process.platform}/${process.arch} 용)`);
  } else {
    // 파일이 있는 것과 실제로 실행되는 것은 다르다.
    // (예: macOS 에서 옆의 dylib 를 못 찾아 바로 죽는 경우)
    const binDir = dirname(ff);
    const probe = spawnSync(ff, ['-version'], {
      cwd: binDir,
      env: {
        ...process.env,
        DYLD_LIBRARY_PATH: [binDir, process.env.DYLD_LIBRARY_PATH].filter(Boolean).join(':'),
        DYLD_FALLBACK_LIBRARY_PATH: [binDir, process.env.DYLD_FALLBACK_LIBRARY_PATH]
          .filter(Boolean)
          .join(':'),
        LD_LIBRARY_PATH: [binDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
      },
    });
    if (probe.status !== 0) {
      const why = (decodeOut(probe.stderr) || probe.error?.message || '').trim().split('\n')[0];
      missing.push(`ffmpeg 이 실행되지 않습니다${why ? ` — ${why}` : ''}`);
    }
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
/* ── 렌더 설정 (속도 / 카드 사이 여백) ──────────────────── */

const SETTINGS_PATH = join(root, 'app', 'data', 'render-settings.json');

/** 목소리가 자연스럽고 도표도 읽히는 범위만 허용한다. 2배속은 넣지 않는다. */
const ALLOWED_SPEEDS = [1, 1.1, 1.25];
/** 배경음악은 내레이션 대비 몇 %로 깔지 (100% = 목소리와 같은 크기) */
const DEFAULT_SETTINGS = { speed: 1, gapSec: 0.4, bgm: 'calm', bgmVolume: 50 };

const normalizeSettings = (s = {}) => ({
  speed: ALLOWED_SPEEDS.includes(Number(s.speed)) ? Number(s.speed) : DEFAULT_SETTINGS.speed,
  gapSec: Math.min(Math.max(Number(s.gapSec) || DEFAULT_SETTINGS.gapSec, 0.15), 0.8),
  bgm: BGM_PRESETS.some((p) => p.id === s.bgm) ? s.bgm : DEFAULT_SETTINGS.bgm,
  bgmVolume: Math.min(
    Math.max(Math.round(Number(s.bgmVolume ?? DEFAULT_SETTINGS.bgmVolume)), 0),
    100,
  ),
});

const loadSettings = () => {
  try {
    return normalizeSettings(JSON.parse(readFileSync(SETTINGS_PATH, 'utf8')));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

const saveSettings = (s) => {
  const next = normalizeSettings(s);
  writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
};

/**
 * 영상 길이에 맞는 배경음악 파일을 준비한다.
 * 같은 종류·같은 길이면 다시 만들지 않는다(합성에 1초쯤 걸린다).
 */
const BGM_PATH = join(root, 'app', 'data', 'bgm.wav');
const BGM_STAMP = join(root, 'app', 'data', 'bgm.json');

const prepareBgm = (id, seconds) => {
  const want = { id, seconds: Math.round(seconds * 10) / 10 };
  try {
    const have = JSON.parse(readFileSync(BGM_STAMP, 'utf8'));
    if (have.id === want.id && have.seconds === want.seconds && existsSync(BGM_PATH)) return BGM_PATH;
  } catch {
    /* 처음이거나 파일이 깨졌으면 새로 만든다 */
  }
  const wav = renderBgm(id, want.seconds);
  if (!wav) return null;
  writeFileSync(BGM_PATH, wav);
  writeFileSync(BGM_STAMP, JSON.stringify(want), 'utf8');
  return BGM_PATH;
};

/** 0.1초 단위로 맞춘다. 30fps에서 0.1초 = 정확히 3프레임이라 영상과 소리가 어긋나지 않는다. */
const toTenth = (sec) => Math.round(sec * 10) / 10;

/** 내레이션을 읽는 데 걸리는 시간 (녹음이 없는 카드용, `npm run narration --fit` 과 같은 기준) */
const SPEAK_CPS = 5.2;
const naturalDuration = (card) => {
  const chars = (card?.narration ?? '').replace(/\s/g, '').length;
  return Math.max(chars / SPEAK_CPS + 0.7, 2.5);
};

/**
 * 녹음들을 하나의 내레이션 트랙으로 합친다.
 *
 * 각 카드 길이를 그 카드 녹음 길이에 맞춰 다시 잡기 때문에 음성과 화면이 정확히 붙는다.
 * 렌더 직전에도 한 번 더 부르기 때문에, 녹음을 고치고 바로 렌더해도 어긋나지 않는다.
 *
 * 속도(speed)는 **녹음 파일과 카드 길이 양쪽에 같이** 적용한다.
 *  - 소리는 atempo 로 빠르게 한다(음정은 그대로 유지된다)
 *  - 카드 사이 여백(gapSec)은 속도를 적용한 뒤에 붙인다. 빨라져도 숨 쉴 틈은 남는다
 *
 * 길이 계산은 항상 "변하지 않는 값"에서 출발한다.
 *  - 녹음이 있는 카드: 녹음 파일의 실제 길이
 *  - 녹음이 없는 카드: 내레이션 글자 수
 * 그래서 이 함수를 몇 번을 다시 돌려도 길이가 누적되지 않는다.
 */
const buildAudio = async () => {
  const script = loadScript();
  if (!script) throw new Error('대본이 없습니다.');

  const { speed, gapSec, bgm, bgmVolume } = loadSettings();
  const meta = readMeta();
  let metaDirty = false;
  const parts = [];
  let recorded = 0;

  for (let i = 0; i < script.cards.length; i++) {
    const clip = join(CLIPS_DIR, `card-${i}.wav`);
    const padded = join(CLIPS_DIR, `part-${i}.wav`);
    let dur;

    if (existsSync(clip)) {
      const entry = meta[i];
      const rawDur = metaDuration(entry) ?? (await probeDuration(clip));
      dur = Math.max(toTenth(rawDur / speed + gapSec), 2);

      // 카드마다 음량이 들쭉날쭉하지 않도록 먼저 재보고(한 번만) 캐시해둔다
      let loudness = metaLoudness(entry);
      if (loudness === undefined) {
        loudness = await measureLoudness(clip);
        meta[i] = { duration: rawDur, loudness };
        metaDirty = true;
      }

      // 음량 맞추기 → 속도 → 카드 길이에 맞게 뒤에 무음 덧대기
      const filter = [loudnormFilter(loudness), speed === 1 ? null : `atempo=${speed}`, 'apad']
        .filter(Boolean)
        .join(',');
      await runFfmpeg([
        '-y', '-i', clip, '-af', filter, '-t', String(dur),
        '-ar', '48000', '-ac', '1', padded,
      ]);
      recorded += 1;
    } else {
      // 녹음이 없는 카드는 읽는 데 걸릴 시간만큼 무음을 둔다
      dur = Math.max(toTenth(naturalDuration(script.cards[i]) / speed), 2);
      await runFfmpeg([
        '-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', String(dur), padded,
      ]);
    }

    script.cards[i].durationSec = dur;
    parts.push(padded);
  }

  if (metaDirty) writeMeta(meta);

  const totalSec = toTenth(script.cards.reduce((a, c) => a + c.durationSec, 0));

  const hasBgm = bgm !== 'none' && bgmVolume > 0;

  if (recorded === 0 && !hasBgm) {
    // 녹음도 배경음악도 없으면 소리 트랙 자체를 붙이지 않는다
    delete script.narrationAudio;
    saveScript(script);
    return { recorded: 0, totalSec, speed, gapSec, bgm, bgmVolume, url: null };
  }

  // 카드별 조각을 이어 붙여 목소리 트랙을 만든다 (녹음이 없으면 무음 트랙이 된다)
  const listFile = join(CLIPS_DIR, 'concat.txt');
  writeFileSync(listFile, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
  const voice = join(CLIPS_DIR, 'voice.wav');
  await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-ar', '48000', voice]);

  const outMp3 = join(AUDIO_DIR, 'narration.mp3');

  if (!hasBgm) {
    await runFfmpeg(['-y', '-i', voice, '-b:a', '160k', outMp3]);
  } else {
    const bgmFile = prepareBgm(bgm, totalSec);
    if (!bgmFile) throw new Error(`배경음악을 만들지 못했습니다: ${bgm}`);

    /**
     * 배경음악 크기는 "내레이션 대비 몇 %" 로 다룬다.
     * 목소리는 이미 -16 LUFS 로 맞춰져 있으므로,
     * 배경음악도 같은 기준으로 재서 원하는 비율만큼 낮춘 값으로 맞춘다.
     * (50% = 목소리보다 6dB 아래)
     */
    const bgmLoud = await measureLoudness(bgmFile);
    const ratioDb = 20 * Math.log10(Math.max(bgmVolume, 1) / 100);
    const gainDb = bgmLoud
      ? LOUDNESS_TARGET + ratioDb - Number(bgmLoud.i)
      : ratioDb; // 못 쟀으면 비율만 적용
    const mixed = join(CLIPS_DIR, 'mixed.wav');
    await runFfmpeg([
      '-y', '-i', voice, '-i', bgmFile,
      '-filter_complex',
      `[1:a]volume=${gainDb.toFixed(2)}dB,aformat=channel_layouts=mono[m];` +
        `[0:a][m]amix=inputs=2:duration=first:normalize=0[a]`,
      '-map', '[a]', '-ar', '48000', '-ac', '1', mixed,
    ]);

    // 섞고 나면 소리가 커져 찌그러질 수 있으니 전체를 다시 -16 LUFS 로 맞춘다
    const mixLoud = await measureLoudness(mixed);
    const finalFilter = loudnormFilter(mixLoud);
    await runFfmpeg([
      '-y', '-i', mixed,
      ...(finalFilter ? ['-af', finalFilter] : []),
      '-ar', '48000', '-b:a', '160k', outMp3,
    ]);
  }

  script.narrationAudio = 'audio/narration.mp3';
  saveScript(script);

  return {
    recorded,
    totalSec,
    speed,
    gapSec,
    bgm,
    bgmVolume,
    url: `/audio/narration.mp3?t=${Date.now()}`,
  };
};

/* ── 진행 상황 스트림 (SSE) ──────────────────────────────── */

/** 가장 최근에 렌더링된 파일 이름 — 업로드 기본값으로 쓴다 */
let lastRendered = null;

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

        // 윈도우 콘솔은 UTF-8 이 아닐 수 있어 버퍼로 모아뒀다가 마지막에 디코딩한다
        const outChunks = [];
        const errChunks = [];
        let spawnFailed = false;

        child.stdout.on('data', (d) => outChunks.push(d));
        child.stderr.on('data', (d) => errChunks.push(d));

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
          const out = decodeOut(Buffer.concat(outChunks));
          const err = decodeOut(Buffer.concat(errChunks));
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

    const errChunks = [];
    p.stderr.on('data', (d) => errChunks.push(d));
    p.on('error', (e) => json(res, 500, { error: e.message }));
    p.on('close', (code) => {
      const err = decodeOut(Buffer.concat(errChunks));
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
      // 길이와 음량을 함께 캐시해둔다 (합칠 때마다 다시 재지 않도록)
      meta[index] = { duration, loudness: await measureLoudness(fixed) };
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
      if (metaDuration(meta[i]) === undefined) {
        meta[i] = { duration: await probeDuration(f), loudness: await measureLoudness(f) };
        dirty = true;
      }
      list.push({ index: i, duration: metaDuration(meta[i]) });
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
          lastRendered = fileName;
          sendEvent(jobId, 'done', { file: fileName, url: `/output/${encodeURIComponent(fileName)}` });
        } else {
          sendEvent(jobId, 'error', { message: `렌더링 실패 (code ${code})` });
        }
        endStream(jobId);
      });
    }, 30);
  },

  /* ── 렌더 설정 ──────────────────────────────────────── */

  'GET /api/settings': async (req, res) => {
    json(res, 200, {
      ...loadSettings(),
      allowedSpeeds: ALLOWED_SPEEDS,
      bgmPresets: BGM_PRESETS.map(({ id, label, desc }) => ({ id, label, desc })),
    });
  },

  'POST /api/settings': async (req, res) => {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    json(res, 200, {
      ...saveSettings(body),
      allowedSpeeds: ALLOWED_SPEEDS,
      bgmPresets: BGM_PRESETS.map(({ id, label, desc }) => ({ id, label, desc })),
    });
  },

  /** 플랫폼별 업로드 문구 */
  'GET /api/publish/copy': async (req, res) => {
    const script = loadScript();
    if (!script) return json(res, 400, { error: '대본이 없습니다.' });
    json(res, 200, { copy: withPublishCopy(script) });
  },

  /** 올릴 수 있는 완성 영상 목록 (최신순) */
  'GET /api/videos': async (req, res) => {
    const files = existsSync(OUTPUT_DIR)
      ? readdirSync(OUTPUT_DIR)
          .filter((f) => f.toLowerCase().endsWith('.mp4'))
          .map((f) => ({ file: f, mtime: statSync(join(OUTPUT_DIR, f)).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime)
      : [];
    json(res, 200, { videos: files.map((f) => f.file), latest: lastRendered ?? files[0]?.file ?? null });
  },

  /* ── 유튜브 ─────────────────────────────────────────── */

  'GET /api/youtube/status': async (req, res) => json(res, 200, youtube.status()),

  'POST /api/youtube/client': async (req, res) => {
    try {
      youtube.setClient(JSON.parse((await readBody(req)).toString('utf8')));
      json(res, 200, youtube.status());
    } catch (e) {
      json(res, 400, { error: e.message });
    }
  },

  'POST /api/youtube/disconnect': async (req, res) => {
    youtube.disconnect();
    json(res, 200, youtube.status());
  },

  /** 구글 로그인 화면으로 보낼 주소 */
  'GET /api/youtube/auth-url': async (req, res, url) => {
    try {
      const redirectUri = `http://localhost:${PORT}/api/youtube/callback`;
      json(res, 200, { url: youtube.authUrl(redirectUri), redirectUri });
    } catch (e) {
      json(res, 400, { error: e.message });
    }
  },

  /** 구글이 되돌려보내는 곳 */
  'GET /api/youtube/callback': async (req, res, url) => {
    const code = url.searchParams.get('code');
    const oauthError = url.searchParams.get('error');
    const page = (title, body) =>
      `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
      `<body style="font-family:system-ui,sans-serif;background:#0c152c;color:#f2f5fb;` +
      `display:grid;place-items:center;height:100vh;margin:0;text-align:center;line-height:1.7">` +
      `<div><h2 style="margin:0 0 10px">${title}</h2><p style="opacity:.75;white-space:pre-line">${body}</p>` +
      `<p style="margin-top:22px"><a href="/" style="color:#ffd874">앱으로 돌아가기</a></p></div>`;

    if (oauthError) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(page('연결이 취소됐습니다', oauthError));
    }
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(page('잘못된 요청입니다', 'code 가 없습니다.'));
    }
    try {
      const st = await youtube.exchangeCode(code);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        page(
          '유튜브 계정이 연결됐습니다',
          `${st.channelTitle ? `채널: ${st.channelTitle}\n` : ''}이 창을 닫고 앱으로 돌아가세요.`,
        ),
      );
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page('연결에 실패했습니다', e.message));
    }
  },

  /** 업로드 — 진행률은 SSE 로 */
  'POST /api/youtube/upload': async (req, res) => {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    const fileName = body.file ?? lastRendered;
    if (!fileName) return json(res, 400, { error: '업로드할 영상이 없습니다. 먼저 렌더링해주세요.' });

    const filePath = join(OUTPUT_DIR, fileName);
    if (!existsSync(filePath)) return json(res, 400, { error: `영상을 찾지 못했습니다: ${fileName}` });

    if (body.mode === 'schedule') {
      const at = new Date(body.publishAt ?? '');
      if (Number.isNaN(at.getTime())) return json(res, 400, { error: '예약 시각이 올바르지 않습니다.' });
      if (at.getTime() < Date.now() + 60_000) {
        return json(res, 400, { error: '예약 시각은 지금보다 최소 1분 뒤여야 합니다.' });
      }
      body.publishAt = at.toISOString();
    }

    const jobId = `y${Date.now()}`;
    json(res, 200, { jobId });

    setTimeout(async () => {
      try {
        console.log(`[유튜브] 업로드 시작 — ${fileName} (${body.mode})`);
        const result = await youtube.upload({
          filePath,
          meta: body.meta ?? {},
          mode: body.mode ?? 'private',
          publishAt: body.publishAt,
          onProgress: ({ sent, total }) => sendEvent(jobId, 'progress', { sent, total }),
        });
        console.log(`[유튜브] 완료 — ${result.url}`);
        sendEvent(jobId, 'done', result);
      } catch (e) {
        console.error('[유튜브] 실패:', e.message);
        sendEvent(jobId, 'error', { message: e.message });
      }
      endStream(jobId);
    }, 120);
  },

  'GET /api/youtube/upload/stream': async (req, res, url) => {
    openStream(res, url.searchParams.get('job'), req);
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
  const cliPath = findClaudeCli();
  console.log(`      대본 생성: ${cliPath ? 'Claude Code CLI 사용 가능' : '수동 모드 (CLI 없음)'}`);
  if (cliPath) console.log(`                 ${cliPath}`);
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
