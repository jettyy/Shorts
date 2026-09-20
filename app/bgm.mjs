/**
 * 배경음악 생성기.
 *
 * 음원을 어디서 받아오지 않고 여기서 직접 합성한다.
 * 그래서 저작권 문제가 아예 없고, 인터넷 없이도 동작하며,
 * 영상 길이에 딱 맞는 길이로 페이드까지 넣어 만들 수 있다.
 *
 * 설계에서 가장 중요한 점: **사람 목소리 대역을 비워둔다.**
 * 말소리의 명료함은 대략 800~3000Hz 에서 결정된다.
 * 그래서 화음은 낮은 쪽(40~500Hz)에, 반짝이는 소리는 높은 쪽(4kHz 이상)에만 두고
 * 그 사이는 거의 비운다. 덕분에 음악을 꽤 올려도 내레이션이 묻히지 않는다.
 */

const SAMPLE_RATE = 48000;

/** A1(55Hz) 기준 반음 단위 → 주파수 */
const hz = (semitone) => 55 * 2 ** (semitone / 12);

/**
 * 음악 종류.
 * chords: 반음 오프셋 배열(낮은 화음), chordSec: 화음 하나가 유지되는 시간
 */
export const BGM_PRESETS = [
  {
    id: 'none',
    label: '없음',
    desc: '내레이션만',
  },
  {
    id: 'calm',
    label: '차분한',
    desc: '정보 전달에 무난 · 기본값',
    chords: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]],
    chordSec: 6,
    shimmer: 0.05,
    pulse: 0,
  },
  {
    id: 'bright',
    label: '밝은',
    desc: '혜택·꿀팁 주제',
    chords: [[3, 7, 10], [-2, 2, 5], [0, 3, 7], [-4, 0, 3]],
    chordSec: 5,
    shimmer: 0.09,
    pulse: 0,
  },
  {
    id: 'warm',
    label: '따뜻한',
    desc: '생활·공감 주제',
    chords: [[-4, 0, 3], [3, 7, 10], [-4, 0, 3], [-2, 2, 7]],
    chordSec: 7,
    shimmer: 0.03,
    pulse: 0,
  },
  {
    id: 'tense',
    label: '긴장감',
    desc: '마감·주의 주제',
    chords: [[-7, -3, 0], [-7, -2, 1], [-7, -3, 0], [-8, -3, 0]],
    chordSec: 4,
    shimmer: 0.02,
    pulse: 0.5, // 초당 0.5회 천천히 맥동
  },
  {
    id: 'minimal',
    label: '아주 옅게',
    desc: '목소리를 최대한 살릴 때',
    chords: [[0, 7], [0, 7], [-2, 5], [0, 7]],
    chordSec: 8,
    shimmer: 0.02,
    pulse: 0,
  },
];

export const getPreset = (id) => BGM_PRESETS.find((p) => p.id === id) ?? null;

/** 화음이 바뀔 때 툭 끊기지 않도록 겹쳐서 넘긴다 */
const crossfade = 1.2;

/**
 * 배경음악 한 곡을 만들어 WAV 버퍼로 돌려준다.
 * seconds 길이에 정확히 맞춰 만들고, 시작과 끝에 페이드를 넣는다.
 */
export const renderBgm = (id, seconds) => {
  const preset = getPreset(id);
  if (!preset || !preset.chords) return null;

  const n = Math.max(Math.round(seconds * SAMPLE_RATE), SAMPLE_RATE);
  const data = new Float32Array(n);

  const { chords, chordSec, shimmer, pulse } = preset;

  // 낮은 화음 — 배음을 조금만 섞어 소리를 덜 인위적으로 만든다.
  // 가장 높은 배음도 800Hz 아래에 머물도록 배수를 제한한다.
  const partials = [
    { mul: 1, gain: 1.0 },
    { mul: 2, gain: 0.34 },
    { mul: 3, gain: 0.14 },
    { mul: 4, gain: 0.06 },
  ];

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;

    // 지금 어느 화음인지, 그리고 다음 화음과 얼마나 겹치는지
    const pos = t / chordSec;
    const idx = Math.floor(pos) % chords.length;
    const nextIdx = (idx + 1) % chords.length;
    const into = (pos - Math.floor(pos)) * chordSec;
    const mix = into > chordSec - crossfade ? (into - (chordSec - crossfade)) / crossfade : 0;

    let v = 0;
    const addChord = (chord, amp) => {
      if (amp <= 0) return;
      for (const st of chord) {
        const f = hz(st);
        for (const p of partials) {
          const freq = f * p.mul;
          if (freq > 780) continue; // 목소리 대역으로 넘어가지 않게
          v += Math.sin(2 * Math.PI * freq * t) * p.gain * amp;
        }
      }
    };
    // 같은 에너지로 넘기기 위해 제곱근 크로스페이드
    addChord(chords[idx], Math.sqrt(1 - mix));
    addChord(chords[nextIdx], Math.sqrt(mix));

    // 높은 반짝임 — 4kHz 위쪽이라 말소리를 가리지 않는다
    if (shimmer > 0) {
      const breathe = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.07 * t);
      v += Math.sin(2 * Math.PI * 4186 * t) * shimmer * 0.5 * breathe;
      v += Math.sin(2 * Math.PI * 5274 * t) * shimmer * 0.3 * (1 - breathe);
      v += Math.sin(2 * Math.PI * 6272 * t) * shimmer * 0.2 * breathe;
    }

    // 천천히 숨 쉬는 느낌 (긴장감 종류에서만)
    if (pulse > 0) {
      v *= 0.75 + 0.25 * Math.sin(2 * Math.PI * pulse * t);
    }

    data[i] = v;
  }

  // 전체를 한 번 고르게 맞춘 뒤 페이드를 씌운다
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(data[i]));
  const norm = peak > 0 ? 0.6 / peak : 0;

  const fadeIn = Math.round(1.5 * SAMPLE_RATE);
  const fadeOut = Math.round(2.0 * SAMPLE_RATE);

  const pcm = Buffer.alloc(n * 4); // 16bit × 2ch
  for (let i = 0; i < n; i++) {
    let s = data[i] * norm;
    if (i < fadeIn) s *= i / fadeIn;
    if (i > n - fadeOut) s *= (n - i) / fadeOut;
    const v = Math.max(-1, Math.min(1, s));
    const int16 = Math.round(v * 32767);
    pcm.writeInt16LE(int16, i * 4);       // L
    pcm.writeInt16LE(int16, i * 4 + 2);   // R
  }

  return wavFile(pcm, SAMPLE_RATE, 2);
};

/** PCM 앞에 WAV 헤더를 붙인다 */
const wavFile = (pcm, rate, channels) => {
  const header = Buffer.alloc(44);
  const byteRate = rate * channels * 2;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
};
