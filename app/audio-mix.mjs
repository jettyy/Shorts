/**
 * 배경음악 믹싱용 필터 만들기.
 *
 * 서버를 띄우지 않고도 시험할 수 있어야 해서 server.mjs 에서 떼어냈다
 * (`npm run test:bgm` 이 이 파일만 불러온다).
 */
/**
 * 목소리가 실제로 나오는 구간들을 합쳐서 돌려준다.
 *
 * 붙어 있는 구간은 하나로 잇는다 — 구간이 끊길 때마다 배경음악 음량이 계단처럼
 * 바뀌어 "틱" 소리가 나기 때문이다. 이어 붙이면 그 지점 자체가 사라진다.
 */
export const voicedWindows = (segments) => {
  const out = [];
  for (const seg of segments) {
    if (!seg.voiced) continue;
    const last = out[out.length - 1];
    if (last && Math.abs(last[1] - seg.start) < 1e-6) last[1] = seg.end;
    else out.push([seg.start, seg.end]);
  }
  return out;
};

/**
 * 배경음악을 깔되 **말하는 동안에는 낮춘다.**
 *
 * ⚠️ 기본은 **꺼져 있다**(`config/style.json` 의 `audio.bgm.enabled`).
 *    배경음악은 한 번 넣었다가 걷어낸 적이 있어서, 켜는 건 쓰는 사람이 정한다.
 *    음원 파일도 저장소에 넣지 않는다(저작권). `public/audio/` 에 직접 넣는다.
 *
 * ⚠️ **사이드체인 압축(자동 더킹)은 쓸 수 없다.** remotion 에 딸려오는 ffmpeg 는
 *    필터가 50개뿐인 최소 빌드라 `sidechaincompress` 도 `asplit` 도 없다.
 *    (패키지를 더 깔지 않는 게 이 프로젝트의 규칙이라 ffmpeg 를 바꿀 수도 없다)
 *
 *    대신 **말하는 구간을 이미 알고 있다** — 내레이션을 카드별로 직접 이어 붙이니까.
 *    그래서 소리를 분석할 필요 없이 그 구간에만 `volume` 을 낮춘다.
 *    소리로 따라가는 방식보다 오히려 안정적이다. 숨소리에 출렁이지 않는다.
 *
 * 음원이 짧으면 영상 길이만큼 이어 붙이고(-stream_loop), 길면 잘라낸다.
 * 음원을 못 찾으면 **조용히 목소리만** 쓴다 — 배경음악 때문에 렌더가 막히면 안 된다.
 */
export const bgmFilter = ({ gainDb, duckDb }, windows) => {
  const duck = windows.map(
    ([a, b]) => `volume=${duckDb}dB:enable='between(t,${a.toFixed(2)},${b.toFixed(2)})'`,
  );
  return [
    [`[1:a]volume=${gainDb}dB`, ...duck].join(',') + '[bg]',
    '[0:a][bg]amix=inputs=2:duration=first:normalize=0[out]',
  ].join(';');
};
