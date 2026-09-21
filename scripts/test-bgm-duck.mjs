/**
 * node scripts/test-bgm-duck.mjs
 *
 * 배경음악이 **말하는 동안에만 낮아지는지**를 실제로 재본다.
 *
 * 필터 문자열이 그럴듯해 보여도 소리가 어떻게 나올지는 알 수 없다. 그래서
 * 가짜 배경음악(6초 내내 같은 크기)을 깔고 "0~3초에 말한다"고 알려준 뒤,
 * **앞 구간과 뒤 구간의 실제 음량을 재서 비교한다.**
 *
 * 목소리 트랙은 **무음**으로 둔다. 그래야 잰 값이 전부 배경음악 음량이다.
 *
 * ⚠️ remotion 에 딸려오는 ffmpeg 는 필터가 50개뿐인 최소 빌드다.
 *    volumedetect·astats·highpass 가 없어서 음량은 `loudnorm` 1차 패스로 잰다
 *    (server.mjs 의 measureLoudness 와 같은 방식).
 */
import { mkdirSync, mkdtempSync, readdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bgmFilter, voicedWindows } from '../app/audio-mix.mjs';
import { listTracks, pickRandom, resolveTrack } from '../app/bgm.mjs';
import { STYLE_DEFAULTS } from '../app/style-config.mjs';

const root = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));

const ffBinary = (tool) => {
  const dir = join(root, 'node_modules', '@remotion');
  const exe = process.platform === 'win32' ? '.exe' : '';
  try {
    for (const name of readdirSync(dir)) {
      if (!name.startsWith('compositor-')) continue;
      const c = join(dir, name, tool + exe);
      if (existsSync(c)) return c;
    }
  } catch {
    /* 아래에서 안내한다 */
  }
  return null;
};

const run = (args) =>
  new Promise((ok, fail) => {
    const bin = ffBinary('ffmpeg');
    if (!bin) return fail(new Error('ffmpeg 없음 — npm install 이 필요합니다'));
    const binDir = dirname(bin);
    const p = spawn(bin, args, {
      cwd: binDir,
      env: {
        ...process.env,
        DYLD_LIBRARY_PATH: binDir,
        DYLD_FALLBACK_LIBRARY_PATH: binDir,
        LD_LIBRARY_PATH: binDir,
      },
    });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (c) => (c === 0 ? ok(err) : fail(new Error(err.slice(-700)))));
    p.on('error', fail);
  });

let failed = 0;
const check = (ok, text) => {
  console.log(`  ${ok ? '✅' : '❌'} ${text}`);
  if (!ok) failed++;
};

/* ── 구간 합치기 ────────────────────────────────────────── */
console.log('\n말하는 구간 합치기');
const merged = voicedWindows([
  { start: 0, end: 3, voiced: true },
  { start: 3, end: 6, voiced: true },   // 붙어 있으니 앞과 하나로
  { start: 6, end: 9, voiced: false },  // 녹음 없는 카드
  { start: 9, end: 12, voiced: true },
]);
check(
  JSON.stringify(merged) === JSON.stringify([[0, 6], [9, 12]]),
  `붙은 구간을 하나로 잇는다 — ${JSON.stringify(merged)}`,
);
check(
  voicedWindows([{ start: 0, end: 3, voiced: false }]).length === 0,
  '녹음이 하나도 없으면 낮출 구간도 없다',
);

/* ── 실제로 소리가 낮아지는가 ───────────────────────────── */
const dir = mkdtempSync(join(tmpdir(), 'bgm-'));
const silence = join(dir, 'voice.wav');
const music = join(dir, 'music.wav');
const mixed = join(dir, 'mixed.wav');

// 목소리 자리는 무음 6초 (잰 값이 전부 배경음악이 되도록)
await run(['-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono:duration=6', '-ac', '1', silence]);
// 배경음악은 6초 내내 같은 크기
await run([
  '-y', '-f', 'lavfi', '-i', 'sine=frequency=500:duration=6:sample_rate=48000', '-ac', '1', music,
]);

const { bgm } = STYLE_DEFAULTS.audio;
await run([
  '-y', '-i', silence, '-stream_loop', '-1', '-i', music,
  '-filter_complex', bgmFilter(bgm, [[0, 3]]), // 0~3초에만 말한다
  '-map', '[out]', '-t', '6', '-ar', '48000', '-ac', '1', mixed,
]);

/** 구간 평균 음량 (loudnorm 1차 패스의 input_i) */
const level = async (from, to) => {
  const err = await run([
    '-i', mixed,
    '-af', `atrim=${from}:${to},loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json`,
    '-f', 'null', '-',
  ]);
  const m = /"input_i"\s*:\s*"(-?[\d.]+)"/.exec(err);
  return m ? Number(m[1]) : NaN;
};

console.log('\n배경음악이 말하는 동안 낮아지는가');
const during = await level(0.4, 2.6);
const after = await level(3.4, 5.8);
console.log(`     말하는 중: ${during.toFixed(1)} dB / 말이 끝난 뒤: ${after.toFixed(1)} dB`);

check(Number.isFinite(during) && Number.isFinite(after), '음량을 잴 수 있다');
check(after > during, '말이 끝나면 배경음악이 올라온다');
check(
  Math.abs(after - during - Math.abs(bgm.duckDb)) < 1.5,
  `설정한 만큼 낮아진다 (설정 ${Math.abs(bgm.duckDb)} dB / 실제 ${(after - during).toFixed(1)} dB)`,
);

/* ── 기본값 ────────────────────────────────────────────── */
console.log('\n기본값');
check(bgm.enabled === false, '배경음악은 기본으로 꺼져 있다');
check(bgm.track === '', '설정 파일에 기본 음원이 박혀 있지 않다 (화면에서 고른다)');

/* ── 음원 목록 · 경로 안전 ─────────────────────────────
 *
 * 곡 이름이 URL 로 오가기 때문에, 그대로 경로에 붙이면 저장소 밖 파일을 읽게 된다.
 * 실제 사용자 음원 이름에 공백·따옴표가 들어 있어서 그것도 같이 본다.
 */
const bgmDir = join(root, 'public', 'bgm');
const samples = ["Joey's Formal Waltz - Unscented.mp3", 'Space Jazz.mp3', '설명.txt'];
mkdirSync(bgmDir, { recursive: true });
for (const f of samples) writeFileSync(join(bgmDir, f), 'x');

console.log('\n음원 목록');
// 폴더에 이미 음원이 있을 수 있으니, 이번에 넣은 것만 놓고 본다
const tracks = await listTracks();
const files = tracks.map((t) => t.file);
check(
  files.includes("Joey's Formal Waltz - Unscented.mp3"),
  '따옴표가 들어간 이름도 목록에 나온다',
);
check(files.includes('Space Jazz.mp3'), '보통 이름도 목록에 나온다');
check(!files.includes('설명.txt'), '소리 파일이 아닌 건 빼고 센다');
check(
  tracks.find((t) => t.file === 'Space Jazz.mp3')?.name === 'Space Jazz',
  '확장자를 뗀 이름을 같이 준다',
);
check(new Set(files).size === files.length, '같은 이름이 두 번 나오지 않는다');

console.log('\n저장소 밖 파일은 읽지 못한다');
for (const bad of ['../../package.json', '../package.json', '/etc/passwd', '..', '']) {
  check(resolveTrack(bad) === null, `막는다 — ${JSON.stringify(bad)}`);
}
check(resolveTrack('없는곡.mp3') === null, '목록에 없는 이름은 막는다');
check(resolveTrack('Space Jazz.mp3') !== null, '목록에 있는 곡은 찾는다');

console.log('\n무작위 고르기');
const two = tracks.filter((t) => samples.includes(t.file));
check(
  pickRandom(two, 'Space Jazz.mp3') === "Joey's Formal Waltz - Unscented.mp3",
  '지금 곡은 빼고 고른다 (같은 곡이 이어지지 않게)',
);
check(
  pickRandom([two[0]], two[0].file) === two[0].file,
  '곡이 하나뿐이면 그 곡을 그대로 쓴다 (빈 값이 되면 안 된다)',
);
check(pickRandom([]) === '', '곡이 아예 없으면 빈 값을 준다');

for (const f of samples) rmSync(join(bgmDir, f), { force: true });

console.log(failed ? `\n❌ ${failed}개 실패\n` : '\n✅ 전부 통과\n');
process.exit(failed ? 1 : 0);
