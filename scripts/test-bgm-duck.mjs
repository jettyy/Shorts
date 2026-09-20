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
import { mkdtempSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bgmFilter, voicedWindows } from '../app/audio-mix.mjs';
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
check(bgm.track === '', '기본 음원이 지정돼 있지 않다 (저장소에 음원을 넣지 않는다)');

console.log(failed ? `\n❌ ${failed}개 실패\n` : '\n✅ 전부 통과\n');
process.exit(failed ? 1 : 0);
