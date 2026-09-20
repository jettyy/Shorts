/**
 * 쇼츠 제작 스튜디오 — 프런트엔드
 *
 * 1 원문 → 2 대본 확인 → 3 녹음 → 4 최종 출력
 * 빌드 도구 없이 바로 돌아가게 순수 ES 모듈로 작성했다.
 */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = {
  step: 1,
  script: null,
  clips: {},       // index → { duration }
  recorder: null,
  recordingIndex: null,
  chunks: [],
  stream: null,
};

/* ── 공통 ────────────────────────────────────────────── */

let toastTimer;
const toast = (msg, isError = false) => {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('err', isError);
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 4200);
};

const busy = (text) => {
  $('#overlayText').textContent = text ?? '처리 중…';
  $('#overlay').classList.remove('hidden');
};
const idle = () => $('#overlay').classList.add('hidden');

const api = async (path, options = {}) => {
  const res = await fetch(path, options);
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data?.error ?? `요청 실패 (${res.status})`);
  return data;
};

const goStep = (n) => {
  state.step = n;
  $$('.panel').forEach((p) => p.classList.toggle('hidden', Number(p.dataset.panel) !== n));
  $$('.step').forEach((b) => {
    const s = Number(b.dataset.step);
    b.classList.toggle('active', s === n);
    b.classList.toggle('done', s < n);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const fmtSec = (s) => `${(Math.round(s * 10) / 10).toFixed(1)}초`;

/* ── 1단계: 원문 입력 ────────────────────────────────── */

const collectInput = () => ({
  text: $('#sourceText').value.trim(),
  accent: $('#accent').value,
  cardCount: Number($('#cardCount').value),
  source: {
    title: $('#srcTitle').value.trim() || '(제목 미입력)',
    publisher: $('#srcPublisher').value.trim(),
    url: $('#srcUrl').value.trim() || 'https://',
    // 확인 기준일은 입력받지 않는다. 대본을 만드는 날이 곧 확인한 날이다.
    // (영상 마지막 카드의 출처 줄에만 쓰이고, 업로드 문구에는 넣지 않는다)
    checkedOn: new Date().toISOString().slice(0, 10),
  },
});

$('#sourceText').addEventListener('input', (e) => {
  $('#charCount').textContent = e.target.value.length.toLocaleString('ko-KR');
});

const analyzeFailed = (message) => {
  idle();
  $('#analyzeNote').className = 'note err';
  $('#analyzeNote').textContent = message;
  $('#manualBox').classList.remove('hidden');
  $('#btnAnalyze').disabled = false;
  toast('자동 생성에 실패했습니다. 수동 모드를 쓰세요.', true);
};

$('#btnAnalyze').addEventListener('click', async () => {
  const input = collectInput();
  if (input.text.length < 100) return toast('원문이 너무 짧습니다. 기사 전체를 붙여넣어 주세요.', true);

  $('#analyzeNote').textContent = '';
  $('#btnAnalyze').disabled = true;
  busy('원문을 읽는 중입니다…');

  let jobId;
  try {
    ({ jobId } = await api('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }));
  } catch (e) {
    // 서버가 꺼져 있거나 응답 전에 끊긴 경우
    return analyzeFailed(
      e.message === 'Failed to fetch'
        ? '서버에 연결하지 못했습니다.\n터미널에서 npm start 가 아직 실행 중인지 확인해주세요.'
        : e.message,
    );
  }

  // 분석은 1~2분 걸린다. 요청을 붙잡고 있지 않고 진행 상황만 받아본다.
  const es = new EventSource(`/api/analyze/stream?job=${jobId}`);
  let done = false;

  es.addEventListener('progress', (ev) => {
    const { elapsed } = JSON.parse(ev.data);
    $('#overlayText').textContent =
      `원문을 읽고 대본을 만드는 중입니다… ${elapsed}초\n(보통 1~2분 걸립니다)`;
  });

  es.addEventListener('done', (ev) => {
    done = true;
    es.close();
    idle();
    $('#btnAnalyze').disabled = false;
    state.script = JSON.parse(ev.data).script;
    renderScript();
    goStep(2);
    toast(`대본 ${state.script.cards.length}장을 만들었습니다`);
  });

  es.addEventListener('error', (ev) => {
    done = true;
    es.close();
    let msg = '분석 중 문제가 생겼습니다.';
    try {
      msg = JSON.parse(ev.data).message;
    } catch {
      msg = '분석 중 서버와의 연결이 끊겼습니다.\n터미널에 표시된 오류를 확인해주세요.';
    }
    analyzeFailed(msg);
  });

  // EventSource 자체가 끊기는 경우(서버 다운 등)도 잡는다
  es.onerror = () => {
    if (done || es.readyState !== EventSource.CLOSED) return;
    analyzeFailed('서버와의 연결이 끊겼습니다.\n터미널 창에 오류가 찍혔는지 확인해주세요.');
  };
});

$('#btnManual').addEventListener('click', () => {
  $('#manualBox').classList.toggle('hidden');
});

$('#btnCopyPrompt').addEventListener('click', async () => {
  const input = collectInput();
  if (!input.text) return toast('원문을 먼저 붙여넣어 주세요.', true);
  try {
    const { prompt } = await api('/api/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    await navigator.clipboard.writeText(prompt);
    toast('지시문을 복사했습니다. 클로드에 붙여넣으세요.');
  } catch (e) {
    toast(e.message, true);
  }
});

$('#btnSavePasted').addEventListener('click', async () => {
  const raw = $('#pastedJson').value.trim();
  if (!raw) return toast('JSON을 붙여넣어 주세요.', true);
  busy('대본을 저장하는 중…');
  try {
    const { script } = await api('/api/script/paste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw, sourceText: $('#sourceText').value }),
    });
    state.script = script;
    renderScript();
    goStep(2);
    toast('대본을 저장했습니다');
  } catch (e) {
    toast(e.message, true);
  } finally {
    idle();
  }
});

/* ── 2단계: 대본 확인 ────────────────────────────────── */

const TYPE_LABEL = {
  hook: '훅', fact: '사실', condition: '조건',
  example: '직접 계산', caveat: '주의점', conclusion: '결론',
};

function renderScript() {
  const s = state.script;
  if (!s?.cards) return;

  const total = s.cards.reduce((a, c) => a + (Number(c.durationSec) || 0), 0);
  const creator = s.cards.filter((c) => c.origin === 'creator').length;
  const visuals = s.cards.filter((c) => c.visual).length;

  $('#scriptSummary').innerHTML = [
    `<span class="chip gold">${s.topic ?? '제목 없음'}</span>`,
    `<span class="chip">${s.cards.length}장 · ${fmtSec(total)}</span>`,
    `<span class="chip">직접 분석 ${creator}장</span>`,
    `<span class="chip">도표 ${visuals}/${s.cards.length}장</span>`,
    `<span class="chip">테마 ${s.accent ?? 'gold'}</span>`,
  ].join('');

  $('#cardList').innerHTML = s.cards
    .map((c, i) => `
      <div class="card" data-i="${i}">
        <div class="card-head">
          <span class="card-no">${i + 1}</span>
          <span class="tag">${TYPE_LABEL[c.type] ?? c.type}</span>
          ${c.origin === 'creator' ? '<span class="tag creator">직접 분석</span>' : '<span class="tag">원문 확인</span>'}
          ${c.visual ? `<span class="tag visual">${c.visual.kind}</span>` : ''}
          <span class="spacer"></span>
          <button class="ghost small btn-preview" data-i="${i}">미리보기</button>
        </div>
        <div class="card-body">
          ${
            i === 0
              ? `<label>주제 배너 — 이게 무슨 영상인지 (첫 화면·썸네일에 크게 박힙니다)
            <input data-field="headline" data-i="${i}" maxlength="24"
              placeholder="예: 한국 부자 TOP 20" value="${escapeHtml(c.headline ?? '')}" />
          </label>`
              : ''
          }
          <label>화면 제목 (줄바꿈으로 줄 나눔, 최대 3줄)
            <textarea class="card-title-input" rows="2" data-field="title" data-i="${i}">${escapeHtml(c.title ?? '')}</textarea>
          </label>
          <label>내레이션 (녹음할 문장)
            <textarea rows="2" data-field="narration" data-i="${i}">${escapeHtml(c.narration ?? '')}</textarea>
          </label>
          <div class="preview-slot" data-i="${i}"></div>
        </div>
      </div>`)
    .join('');
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * 안내 문구를 화면에 올릴 HTML 로.
 *
 * 오류·안내에는 "이 주소에서 사용 설정하세요" 같은 링크가 들어간다. 글자로만 두면
 * 복사해서 주소창에 붙여야 하므로 눌러서 갈 수 있게 만든다.
 * **escapeHtml 을 먼저 걸어** 문구가 HTML 로 해석되지 않게 한다.
 */
const linkify = (msg) =>
  escapeHtml(msg).replace(
    /https?:\/\/[^\s<]+/g,
    (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`,
  );

$('#cardList').addEventListener('input', (e) => {
  const field = e.target.dataset.field;
  if (!field) return;
  state.script.cards[Number(e.target.dataset.i)][field] = e.target.value;
});

$('#cardList').addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-preview');
  if (!btn) return;
  const i = Number(btn.dataset.i);
  btn.disabled = true;
  btn.textContent = '그리는 중…';
  try {
    await saveScript();
    const { url } = await api('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index: i }),
    });
    document.querySelector(`.preview-slot[data-i="${i}"]`).innerHTML =
      `<img class="preview-img" src="${url}" alt="카드 ${i + 1} 미리보기" />`;
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = '미리보기';
  }
});

const saveScript = () =>
  api('/api/script', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state.script),
  });

$('#btnBack1').addEventListener('click', () => goStep(1));
$('#btnToRecord').addEventListener('click', async () => {
  busy('대본을 저장하는 중…');
  try {
    await saveScript();
    await loadClips();
    renderRecorders();
    goStep(3);
  } catch (e) {
    toast(e.message, true);
  } finally {
    idle();
  }
});

/* ── 3단계: 녹음 ─────────────────────────────────────── */

async function loadClips() {
  const { clips } = await api('/api/clips');
  state.clips = {};
  clips.forEach((c) => {
    if (c.duration > 0) state.clips[c.index] = c;
  });
}

function renderRecorders() {
  const cards = state.script.cards;
  $('#recList').innerHTML = cards
    .map((c, i) => {
      const clip = state.clips[i];
      return `
      <div class="rec ${clip ? 'recorded' : ''}" data-i="${i}">
        <div class="rec-head">
          <span class="card-no">${i + 1}</span>
          <span class="tag">${TYPE_LABEL[c.type] ?? c.type}</span>
          ${clip ? `<span class="rec-dur">녹음됨 · ${fmtSec(clip.duration)}</span>` : ''}
        </div>
        <div class="rec-screen">화면: ${escapeHtml((c.title ?? '').replace(/\n/g, ' / '))}${c.visual ? ` — [${c.visual.kind}]` : ''}</div>
        <div class="rec-script">${escapeHtml(c.narration ?? '(내레이션 없음)')}</div>
        <div class="mic-error hidden"></div>
        <div class="rec-actions">
          <button class="primary rec-btn" data-i="${i}">${clip ? '다시 녹음' : '● 녹음 시작'}</button>
          ${clip ? `<audio controls src="/clip/${i}?t=${Date.now()}"></audio>
                    <button class="ghost small btn-del" data-i="${i}">삭제</button>` : ''}
        </div>
      </div>`;
    })
    .join('');
  updateRecProgress();
}

function updateRecProgress() {
  const total = state.script.cards.length;
  const done = Object.keys(state.clips).length;
  $('#recBar').style.width = `${(done / total) * 100}%`;
  $('#recCountText').textContent = `${done} / ${total}장 녹음 완료`;
  $('#btnBuildAudio').textContent = done === 0 ? '녹음 없이 넘어가기 →' : '녹음 확정하고 다음 →';
}

$('#recList').addEventListener('click', async (e) => {
  const recBtn = e.target.closest('.rec-btn');
  const delBtn = e.target.closest('.btn-del');

  if (delBtn) {
    const i = Number(delBtn.dataset.i);
    await api(`/api/clip?index=${i}`, { method: 'DELETE' });
    delete state.clips[i];
    renderRecorders();
    return;
  }
  if (!recBtn) return;

  const i = Number(recBtn.dataset.i);
  if (state.recordingIndex === i) return stopRecording();
  if (state.recordingIndex !== null) return toast('먼저 녹음을 멈춰주세요.', true);
  startRecording(i, recBtn);
});

/**
 * 마이크를 열지 못한 진짜 이유를 알려준다.
 *
 * 권한을 이미 허용했는데도 실패하는 경우가 많다.
 * (윈도우 시스템 설정에서 막힘 / 다른 앱이 마이크를 점유 / 장치 없음)
 * 전부 "권한을 허용하세요" 로 뭉뚱그리면 원인을 찾을 수 없다.
 */
const micErrorMessage = (err) => {
  const name = err?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return (
        '브라우저가 마이크를 열지 못했습니다.\n' +
        '사이트 권한을 이미 허용했다면 윈도우 설정이나 회사 정책에서 막힌 경우입니다.\n' +
        '위의 [마이크 점검] 을 눌러 어느 단계에서 막혔는지 확인해주세요.'
      );
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return (
        '마이크 장치를 찾지 못했습니다.\n' +
        '마이크가 연결돼 있는지, 윈도우 소리 설정에서 입력 장치로 잡히는지 확인해주세요.'
      );
    case 'NotReadableError':
    case 'TrackStartError':
      return (
        '마이크를 열 수 없습니다. 권한 문제가 아니라 장치를 못 쓰는 상태입니다.\n' +
        '· 윈도우: 설정 → 개인 정보 및 보안 → 마이크 →\n' +
        '  "마이크 액세스" 와 "앱이 마이크에 액세스하도록 허용" 을 켜주세요\n' +
        '· 줌·팀즈·녹음기 등 마이크를 쓰는 다른 프로그램을 모두 종료해주세요\n' +
        '· 그래도 안 되면 브라우저를 완전히 껐다 켜주세요'
      );
    case 'OverconstrainedError':
      return '이 마이크가 요청한 설정을 지원하지 않습니다. 다른 입력 장치를 선택해보세요.';
    case 'SecurityError':
      return 'localhost 가 아닌 주소로 접속하면 녹음이 막힙니다. http://localhost:4321 로 열어주세요.';
    default:
      return `마이크를 열지 못했습니다.\n(${name || '알 수 없는 오류'}: ${err?.message ?? ''})`;
  }
};

/** 녹음 카드 안에 오류를 계속 띄워둔다 (토스트는 금방 사라져서 읽기 어렵다) */
const showMicError = (index, text) => {
  const slot = document.querySelector(`.rec[data-i="${index}"] .mic-error`);
  if (slot) {
    slot.textContent = text;
    slot.classList.remove('hidden');
  }
  toast(text.split('\n')[0], true);
};

async function startRecording(index, btn) {
  document.querySelector(`.rec[data-i="${index}"] .mic-error`)?.classList.add('hidden');

  if (!navigator.mediaDevices?.getUserMedia) {
    return showMicError(
      index,
      '이 브라우저에서는 녹음을 지원하지 않습니다.\nChrome, Edge, Safari 최신 버전에서 열어주세요.',
    );
  }
  if (typeof MediaRecorder === 'undefined') {
    return showMicError(index, '이 브라우저는 MediaRecorder 를 지원하지 않습니다.');
  }

  /**
   * autoGainControl 을 반드시 끈다.
   *
   * 켜두면 브라우저가 녹음 중에 계속 볼륨을 조절해서,
   * 말을 시작할 때는 크다가 점점 작아진다. 카드마다 이게 반복되니
   * 이어 붙였을 때 소리가 커졌다 작아졌다 한다.
   * 음량은 녹음이 끝난 뒤 서버에서 한 번에 고르게 맞춘다(loudnorm).
   *
   * echoCancellation 도 끈다. 스피커 소리를 지우려고 신호를 건드리는데,
   * 혼자 내레이션을 녹음할 때는 득보다 실이 크다.
   * noiseSuppression 은 음량을 흔들지 않고 잡음만 줄여주므로 켜둔다.
   */
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: false,
        echoCancellation: false,
        noiseSuppression: true,
      },
    });
  } catch (first) {
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error('[마이크] 열기 실패', err);
      return showMicError(index, micErrorMessage(err));
    }
  }

  state.chunks = [];
  try {
    state.recorder = new MediaRecorder(state.stream, pickRecordOptions());
  } catch (err) {
    console.error('[녹음] MediaRecorder 생성 실패', err);
    state.stream?.getTracks().forEach((t) => t.stop());
    state.stream = null;
    return showMicError(
      index,
      '이 브라우저에서 녹음을 시작하지 못했습니다.\n' +
        `크롬으로 열면 됩니다. (${err.name}: ${err.message})`,
    );
  }
  state.recorder.ondataavailable = (ev) => ev.data.size && state.chunks.push(ev.data);
  state.recorder.onstop = () => uploadClip(index);
  state.recorder.onerror = (ev) => {
    console.error('[녹음] 오류', ev.error);
    toast(`녹음 중 오류: ${ev.error?.name ?? '알 수 없음'}`, true);
  };
  state.recorder.start();
  state.recordingIndex = index;

  btn.textContent = '■ 녹음 멈추기';
  btn.classList.add('recording');
  document.querySelector(`.rec[data-i="${index}"]`)?.classList.add('active');
}

function stopRecording() {
  if (!state.recorder) return;
  state.recorder.stop();
  state.stream?.getTracks().forEach((t) => t.stop());
}

/**
 * 이 브라우저가 실제로 녹음할 수 있는 형식을 고른다.
 *
 * **사파리는 webm 을 못 만든다.** MediaRecorder 는 지원하지만 컨테이너가 mp4(AAC)다.
 * 그래서 예전처럼 'audio/webm' 을 강제로 넘기면 NotSupportedError 로 죽어서
 * 녹음 버튼을 눌러도 아무 일도 안 일어났다.
 *
 * 되는 형식을 순서대로 찾아보고, 하나도 없으면 옵션 없이 브라우저가 알아서 고르게 둔다.
 * 서버는 ffmpeg 로 wav 변환하므로 어떤 형식으로 와도 상관없다.
 */
function pickRecordOptions() {
  const candidates = [
    'audio/webm;codecs=opus', // 크롬·엣지·파이어폭스
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2', // 사파리
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  const supported = candidates.find(
    (t) => window.MediaRecorder?.isTypeSupported?.(t),
  );
  return supported ? { mimeType: supported } : {};
}

async function uploadClip(index) {
  // 녹음기가 실제로 쓴 형식을 그대로 보낸다 (사파리는 mp4 로 나온다)
  const type = state.recorder?.mimeType || state.chunks[0]?.type || 'application/octet-stream';
  const blob = new Blob(state.chunks, { type });
  state.recorder = null;
  state.recordingIndex = null;
  state.stream = null;

  if (blob.size < 1000) {
    toast('녹음이 너무 짧습니다.', true);
    renderRecorders();
    return;
  }

  busy('녹음을 저장하는 중…');
  try {
    const { duration } = await api(`/api/clip?index=${index}`, {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'application/octet-stream' },
      body: blob,
    });
    state.clips[index] = { index, duration };
    renderRecorders();
    toast(`${index + 1}번 카드 녹음 완료 (${fmtSec(duration)})`);
  } catch (e) {
    toast(e.message, true);
    renderRecorders();
  } finally {
    idle();
  }
}

// 스페이스바로 녹음 시작/정지 (입력 중일 때는 제외)
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || state.step !== 3) return;
  if (['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement?.tagName)) return;
  if (state.recordingIndex !== null) {
    e.preventDefault();
    stopRecording();
  }
});

$('#btnBack2').addEventListener('click', () => goStep(2));

$('#btnBuildAudio').addEventListener('click', async () => {
  busy('녹음을 합치고 카드 길이를 맞추는 중…');
  try {
    const r = await api('/api/audio/build', { method: 'POST' });
    state.script = await api('/api/script');
    renderFinal(r);
    goStep(4);
  } catch (e) {
    toast(e.message, true);
  } finally {
    idle();
  }
});

/* ── 4단계: 최종 출력 ────────────────────────────────── */

function renderFinal(build) {
  const s = state.script;
  // 3단계를 거치지 않고 바로 4단계로 오면 state.clips 가 비어 있다.
  // 합치기 결과(build.recorded)가 있으면 그걸 우선 믿는다.
  const recorded = build?.recorded ?? Object.keys(state.clips).length;
  const speed = build?.speed ?? state.settings?.speed ?? 1;
  $('#finalInfo').innerHTML = [
    ['주제', s.topic ?? '-'],
    ['카드', `${s.cards.length}장`],
    ['전체 길이', fmtSec(build?.totalSec ?? s.cards.reduce((a, c) => a + c.durationSec, 0))],
    ['재생 속도', speed === 1 ? '보통' : `${speed}배`],
    ['내레이션', recorded > 0 ? `${recorded}장 녹음 적용` : '없음 (무음)'],
    ['해상도', '1080 × 1920 · 30fps'],
  ]
    .map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`)
    .join('');

  if (build?.url && recorded > 0) {
    $('#audioPreview').classList.remove('hidden');
    $('#fullAudio').src = build.url;
  }

  /*
   * 지난 작업의 완성본·문구가 화면에 남아 있으면 안 된다.
   * 일단 싹 지우고, "지금 대본으로 만든 영상"이 있을 때만 다시 연다.
   */
  clearOutputUI();
  api('/api/videos')
    .then(({ latest, current }) => {
      // current=false 면 output 폴더에 남은 지난 영상이다. 그걸로 문구를 열면 안 된다.
      if (!latest || !current) return;
      $('#publishBox').classList.remove('hidden');
      return loadPublishCopy().then(() => refreshYt());
    })
    .catch(() => {});
}

/**
 * 4단계 출력 영역을 비운다 (완성본 미리보기 · 저장 안내 · 업로드 문구 · 유튜브 입력란).
 *
 * 이게 없으면 새 원문으로 다시 시작해도 4단계에는 이전 영상의 문구가 그대로 남는다.
 */
function clearOutputUI() {
  publishCopy = null;

  $('#resultBox').classList.add('hidden');
  $('#resultVideo').removeAttribute('src');
  $('#renderBox').classList.add('hidden');
  $('#renderBar').style.width = '0%';
  $('#btnRender').disabled = false;

  const note = $('#savedNote');
  note.classList.add('hidden');
  note.innerHTML = '';

  $('#btnDownload').removeAttribute('href');
  $('#btnDownloadCopy').removeAttribute('href');

  $('#publishBox').classList.add('hidden');
  $('#copyList').innerHTML = '';
  $('#ytTitle').value = '';
  $('#ytDesc').value = '';
  $('#ytTags').value = '';
  $('#ytResult').classList.add('hidden');
  $('#ytProgressBox').classList.add('hidden');
  // 예약 시각은 영상마다 새로 계산한다 (지난 영상 기준이 남으면 안 된다)
  $('#ytWhen').value = '';
  $('#ytSlotNote').className = 'slot-note';
  $('#ytSlotNote').textContent = '';

  $('#audioPreview').classList.add('hidden');
  $('#fullAudio').removeAttribute('src');
}

$('#btnBack3').addEventListener('click', () => goStep(3));

$('#btnRender').addEventListener('click', async () => {
  $('#btnRender').disabled = true;
  $('#renderBox').classList.remove('hidden');
  $('#resultBox').classList.add('hidden');
  $('#renderPhase').textContent = '렌더링을 시작합니다…';
  $('#renderBar').style.width = '0%';

  try {
    const { jobId } = await api('/api/render', { method: 'POST' });
    const es = new EventSource(`/api/render/stream?job=${jobId}`);

    es.addEventListener('progress', (ev) => {
      const d = JSON.parse(ev.data);
      $('#renderPhase').textContent = `${d.phase} — ${d.done} / ${d.total}`;
      $('#renderBar').style.width = `${(d.done / d.total) * 100}%`;
    });
    es.addEventListener('done', (ev) => {
      const d = JSON.parse(ev.data);
      es.close();
      $('#renderBox').classList.add('hidden');
      $('#resultBox').classList.remove('hidden');
      $('#resultVideo').src = d.url;
      $('#btnRender').disabled = false;
      toast('영상이 완성됐습니다');

      const copyUrl = `/api/publish/copy.txt?name=${encodeURIComponent(d.file)}`;
      const txtName = `${d.file.replace(/\.mp4$/i, '')}_문구.txt`;
      $('#btnDownload').href = d.url;
      $('#btnDownload').setAttribute('download', d.file);
      $('#btnDownloadCopy').href = copyUrl;
      $('#btnDownloadCopy').setAttribute('download', txtName);

      // 완성됐으니 업로드 섹션을 연다
      $('#publishBox').classList.remove('hidden');
      loadPublishCopy().catch((err) => toast(err.message, true));
      refreshYt().catch(() => {});

      autoSave(d.url, d.file, copyUrl, txtName);
    });
    es.addEventListener('error', (ev) => {
      es.close();
      $('#btnRender').disabled = false;
      $('#renderPhase').textContent = '렌더링에 실패했습니다.';
      try {
        toast(JSON.parse(ev.data).message, true);
      } catch {
        toast('렌더링 중 연결이 끊겼습니다.', true);
      }
    });
  } catch (e) {
    $('#btnRender').disabled = false;
    toast(e.message, true);
  }
});

/** 링크를 만들어 눌러서 파일 하나를 내려받는다 */
const triggerDownload = (url, filename) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
};

/**
 * 렌더가 끝나면 영상과 문구를 자동으로 저장한다.
 *
 * 브라우저는 한 사이트가 파일을 여러 개 자동으로 내려받으려 하면 한 번 물어본다.
 * (주소창에 "여러 파일 다운로드" 허용 여부) 그래서 두 번째는 잠깐 띄우고 보내고,
 * 막혔을 수도 있으니 아래 버튼으로 직접 받을 수 있다는 안내를 같이 띄운다.
 */
function autoSave(videoUrl, videoName, copyUrl, copyName) {
  const note = $('#savedNote');
  try {
    triggerDownload(videoUrl, videoName);
    setTimeout(() => triggerDownload(copyUrl, copyName), 900);
    note.className = 'saved-note';
    note.innerHTML =
      '<b>다운로드 폴더에 저장했습니다.</b><br>' +
      `· ${escapeHtml(videoName)}<br>` +
      `· ${escapeHtml(copyName)}<br>` +
      '브라우저가 "여러 파일 다운로드"를 물어보면 <b>허용</b>을 눌러주세요. ' +
      '안 받아졌다면 아래 버튼으로 직접 받을 수 있습니다.';
  } catch {
    note.className = 'saved-note warn';
    note.textContent = '자동 저장에 실패했습니다. 아래 버튼으로 직접 내려받아 주세요.';
  }
  note.classList.remove('hidden');
}

/** 새 영상 만들기 — 화면을 1단계 상태로 되돌린다 (서버의 대본·녹음은 그대로 둔다) */
$('#btnRestart').addEventListener('click', () => {
  $('#sourceText').value = '';
  $('#charCount').textContent = '0';
  clearOutputUI();
  goStep(1);
});

/**
 * 전부 지우고 처음부터 — 서버에 남은 대본·원문·녹음까지 지운다.
 * 이걸 해야 다음 작업의 4단계에 이전 영상의 문구가 남지 않는다.
 * (만들어 둔 영상 파일은 지우지 않는다 — 되돌릴 수 없는 결과물이다)
 */
$('#btnResetAll').addEventListener('click', async () => {
  const ok = confirm(
    '원문·대본·녹음·합친 내레이션을 전부 지웁니다.\n' +
      '이미 만든 영상 파일(output 폴더)은 그대로 둡니다.\n\n' +
      '계속할까요?',
  );
  if (!ok) return;

  busy('전부 지우는 중…');
  try {
    const r = await api('/api/reset', { method: 'POST' });

    state.script = null;
    state.clips = {};
    $('#sourceText').value = '';
    $('#charCount').textContent = '0';
    $('#cardList').innerHTML = '';
    $('#recList').innerHTML = '';
    clearOutputUI();
    goStep(1);

    toast(r.clips > 0 ? `초기화했습니다 (녹음 ${r.clips}개 삭제)` : '초기화했습니다');
  } catch (e) {
    toast(e.message, true);
  } finally {
    idle();
  }
});

/* ── 단계 버튼 직접 클릭 ─────────────────────────────── */
$('#steps').addEventListener('click', (e) => {
  const btn = e.target.closest('.step');
  if (!btn) return;
  const n = Number(btn.dataset.step);
  if (n > 1 && !state.script) return toast('먼저 대본을 만들어 주세요.', true);
  if (n === 3) {
    loadClips().then(() => {
      renderRecorders();
      goStep(3);
    });
    return;
  }
  if (n === 4) {
    // 녹음 개수를 알아야 "내레이션" 표시가 맞는다
    loadClips()
      .then(() => renderFinal())
      .catch(() => renderFinal());
  }
  goStep(n);
});

/* ── 시작 ────────────────────────────────────────────── */

(async () => {
  try {
    state.settings = await api('/api/settings');
    markTempo(state.settings);

    const st = await api('/api/status');
    $('#status').innerHTML = st.claudeCli
      ? '대본 생성 <b>자동</b> (Claude Code)'
      : '대본 생성 <span style="color:#ffd874">수동 모드</span>';
    if (!st.claudeCli) $('#manualBox').classList.remove('hidden');

    // 설치가 덜 됐으면 3단계에서 터지기 전에 미리 알린다
    if (st.install && !st.install.ok) {
      $('#installWarn').innerHTML =
        '<b>설치가 덜 됐습니다.</b> 대본까지는 만들 수 있지만, ' +
        '녹음 합치기와 영상 렌더링이 동작하지 않습니다.' +
        `<ul>${st.install.missing.map((m) => `<li>없음: ${escapeHtml(m)}</li>`).join('')}</ul>` +
        '터미널에서 <code>Ctrl+C</code> 로 서버를 끄고, 프로젝트 폴더에서 ' +
        '<code>npm install</code> 을 실행한 뒤 <code>npm start</code> 로 다시 켜주세요.';
      $('#installWarn').classList.remove('hidden');
    }

    if (st.hasScript) {
      const saved = await api('/api/script');
      // 초기화 뒤에는 카드가 없는 빈 대본이 남는다. 그건 "대본 없음"으로 본다.
      if (saved?.cards?.length) {
        state.script = saved;
        renderScript();
        toast(`이전 작업을 불러왔습니다 (카드 ${state.script.cards.length}장)`);
      }
    }
  } catch {
    $('#status').textContent = '서버 연결 실패';
  }
  goStep(1);
})();

/* ── 업로드 (4단계) ──────────────────────────────────── */

const PLATFORMS = [
  { key: 'youtube', label: '유튜브', pick: (c) => `${c.youtube.title}\n\n${c.youtube.description}` },
  { key: 'instagram', label: '인스타그램', pick: (c) => c.instagram.caption },
  { key: 'threads', label: '쓰레드', pick: (c) => c.threads.text },
];

let publishCopy = null;

async function loadPublishCopy() {
  const { copy } = await api('/api/publish/copy');
  publishCopy = copy;

  $('#copyList').innerHTML = PLATFORMS.map(
    (p) => `
      <div class="copy-item">
        <div class="copy-top">
          <span>${p.label}</span>
          <span class="spacer"></span>
          <button class="ghost small btn-copy" data-key="${p.key}">복사</button>
        </div>
        <div class="copy-body">${escapeHtml(p.pick(copy))}</div>
      </div>`,
  ).join('');

  // 유튜브 입력란 채우기 (사용자가 고쳐도 됨)
  $('#ytTitle').value = copy.youtube.title;
  $('#ytDesc').value = copy.youtube.description;
  $('#ytTags').value = (copy.youtube.tags ?? []).join(', ');
}

$('#copyList').addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-copy');
  if (!btn || !publishCopy) return;
  const platform = PLATFORMS.find((p) => p.key === btn.dataset.key);
  try {
    await navigator.clipboard.writeText(platform.pick(publishCopy));
    btn.textContent = '복사됨';
    setTimeout(() => (btn.textContent = '복사'), 1600);
  } catch {
    toast('복사에 실패했습니다. 본문을 직접 선택해 복사해주세요.', true);
  }
});

/** 유튜브 연결 상태에 따라 세 단계 중 하나만 보여준다 */
function renderYtState(st) {
  const setup = !st.hasClient;
  const connect = st.hasClient && !st.connected;
  const ready = st.connected;

  $('#ytSetup').classList.toggle('hidden', !setup);
  $('#ytConnect').classList.toggle('hidden', !connect);
  $('#ytUpload').classList.toggle('hidden', !ready);

  const state = $('#ytState');
  state.classList.toggle('on', ready);
  state.textContent = ready
    ? `연결됨${st.channelTitle ? ` · ${st.channelTitle}` : ''}`
    : connect
      ? '계정 연결이 필요합니다'
      : 'OAuth 클라이언트 등록이 필요합니다';

  // 업로드 영역이 열리고 기본값(예약 발행)이 선택돼 있으면 추천 시각을 채워둔다
  if (ready && document.querySelector('input[name="ytMode"]:checked')?.value === 'schedule') {
    fillNextSlot();
  }
}

const refreshYt = async () => renderYtState(await api('/api/youtube/status'));

$('#btnYtSaveClient').addEventListener('click', async () => {
  try {
    const st = await api('/api/youtube/client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: $('#ytClientId').value,
        clientSecret: $('#ytClientSecret').value,
      }),
    });
    renderYtState(st);
    toast('저장했습니다. 이제 구글 계정을 연결해주세요.');
  } catch (e) {
    toast(e.message, true);
  }
});

$('#btnYtConnect').addEventListener('click', async () => {
  try {
    const { url } = await api('/api/youtube/auth-url');
    window.open(url, '_blank', 'noopener');
    toast('새 창에서 로그인한 뒤 돌아와 주세요.');
    // 돌아왔을 때 자동으로 상태를 갱신한다
    const onFocus = async () => {
      await refreshYt();
      window.removeEventListener('focus', onFocus);
    };
    window.addEventListener('focus', onFocus);
  } catch (e) {
    toast(e.message, true);
  }
});

$('#btnYtReset').addEventListener('click', async () => {
  await api('/api/youtube/disconnect', { method: 'POST' });
  $('#ytSetup').classList.remove('hidden');
  $('#ytConnect').classList.add('hidden');
});

$('#btnYtDisconnect').addEventListener('click', async () => {
  renderYtState(await api('/api/youtube/disconnect', { method: 'POST' }));
  toast('연결을 해제했습니다.');
});

/* ── 예약 발행 시각 ──────────────────────────────────── */

/** Date → datetime-local 입력값 (그 자리 시간대 기준 "YYYY-MM-DDTHH:mm") */
const toLocalInput = (date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

const fmtWhen = (iso) =>
  new Date(iso).toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * 다음 예약 시각을 서버에서 받아 채운다.
 *
 * 채널에 이미 예약된 것 중 **가장 늦은 시각 뒤 3~5시간 사이**를 랜덤으로 고른다.
 * 예약된 게 없으면 지금을 기준으로 잡는다.
 * @param force true 면 이미 값이 있어도 새로 계산한다
 */
async function fillNextSlot(force = false) {
  const input = $('#ytWhen');
  const note = $('#ytSlotNote');
  if (!force && input.value) return;

  note.className = 'slot-note';
  note.textContent = '추천 시각을 계산하는 중…';
  try {
    const s = await api('/api/youtube/next-slot');
    input.value = toLocalInput(new Date(s.suggested));

    const [lo, hi] = s.gapHours;
    if (s.basedOn) {
      note.innerHTML =
        `마지막 예약(<b>${escapeHtml(fmtWhen(s.basedOn))}</b>` +
        `${s.basedOnTitle ? ` · ${escapeHtml(s.basedOnTitle.slice(0, 24))}` : ''})` +
        ` 뒤 ${lo}~${hi}시간 사이로 잡았습니다. 예약된 영상 ${s.scheduledCount}개.`;
    } else {
      note.textContent = `예약된 영상이 없어서 지금부터 ${lo}~${hi}시간 뒤로 잡았습니다.`;
    }
    if (s.note) {
      note.className = 'slot-note warn';
      note.textContent = `${note.textContent} — ${s.note}`;
    }
  } catch (e) {
    // 추천에 실패해도 예약은 할 수 있어야 한다
    note.className = 'slot-note warn';
    note.textContent = `추천 시각을 못 가져왔습니다 (${e.message}). 직접 골라주세요.`;
    if (!input.value) {
      const d = new Date(Date.now() + 4 * 3600_000);
      d.setSeconds(0, 0);
      input.value = toLocalInput(d);
    }
  }
}

$('#btnYtSlot').addEventListener('click', () => fillNextSlot(true));

// 예약 발행을 고르면 시각 입력을 보여준다
document.querySelectorAll('input[name="ytMode"]').forEach((r) =>
  r.addEventListener('change', () => {
    const schedule = document.querySelector('input[name="ytMode"]:checked').value === 'schedule';
    $('#ytWhenRow').classList.toggle('hidden', !schedule);
    if (schedule) fillNextSlot();
  }),
);

$('#btnYtUpload').addEventListener('click', async () => {
  const mode = document.querySelector('input[name="ytMode"]:checked').value;
  const when = $('#ytWhen').value;
  if (mode === 'schedule') {
    if (!when) return toast('예약 시각을 입력해주세요.', true);
    // 유튜브는 과거 시각으로 예약할 수 없다. 여기서 먼저 막아준다.
    if (new Date(when).getTime() <= Date.now()) {
      return toast('예약 시각이 이미 지났습니다. 앞으로의 시각을 골라주세요.', true);
    }
  }

  const btn = $('#btnYtUpload');
  btn.disabled = true;
  $('#ytResult').classList.add('hidden');
  $('#ytProgressBox').classList.remove('hidden');
  $('#ytPhase').textContent = '업로드 준비 중…';
  $('#ytBar').style.width = '0%';

  const showYtError = (msg) => {
    btn.disabled = false;
    $('#ytProgressBox').classList.add('hidden');
    const box = $('#ytResult');
    box.className = 'yt-result err';
    /*
     * 오류 안내에는 "이 주소에서 사용 설정하세요" 같은 링크가 들어간다.
     * 글자로만 두면 복사해서 주소창에 붙여야 해서, 눌러서 갈 수 있게 링크로 만든다.
     * (escapeHtml 을 먼저 걸어 오류 문구가 HTML 로 해석되지 않게 한다)
     */
    box.innerHTML = linkify(msg);
    box.classList.remove('hidden');
  };

  try {
    const { jobId } = await api('/api/youtube/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        publishAt: mode === 'schedule' ? new Date(when).toISOString() : undefined,
        meta: {
          title: $('#ytTitle').value.trim(),
          description: $('#ytDesc').value,
          tags: $('#ytTags').value.split(',').map((t) => t.trim()).filter(Boolean),
        },
      }),
    });

    const es = new EventSource(`/api/youtube/upload/stream?job=${jobId}`);
    es.addEventListener('progress', (ev) => {
      const { sent, total } = JSON.parse(ev.data);
      if (!total) return;
      $('#ytPhase').textContent =
        `업로드 중 — ${(sent / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB`;
      $('#ytBar').style.width = `${(sent / total) * 100}%`;
    });
    es.addEventListener('done', (ev) => {
      es.close();
      const r = JSON.parse(ev.data);
      btn.disabled = false;
      $('#ytProgressBox').classList.add('hidden');
      const box = $('#ytResult');
      box.className = 'yt-result';
      box.innerHTML =
        `<b>올라갔습니다.</b> 상태: ${r.privacyStatus}` +
        (r.publishAt ? ` · 공개 예정 ${new Date(r.publishAt).toLocaleString('ko-KR')}` : '') +
        `<br><a href="${r.url}" target="_blank" rel="noopener">영상 보기</a> · ` +
        `<a href="${r.studioUrl}" target="_blank" rel="noopener">스튜디오에서 수정</a>`;
      box.classList.remove('hidden');
      toast('유튜브 업로드 완료');
    });
    es.addEventListener('error', (ev) => {
      es.close();
      let msg = '업로드에 실패했습니다.';
      try {
        msg = JSON.parse(ev.data).message;
      } catch {
        msg = '업로드 중 서버와의 연결이 끊겼습니다.';
      }
      showYtError(msg);
    });
  } catch (e) {
    showYtError(e.message);
  }
});

/* ── 마이크 점검 ─────────────────────────────────────── */

/**
 * 마이크가 왜 안 되는지 브라우저에 직접 물어본다.
 *
 * "권한을 허용했는데도 안 된다" 는 경우가 많은데, 원인이 여러 단계에 걸쳐 있다.
 *   사이트 권한 / 운영체제 권한 / 회사 정책 / 장치 자체
 * 어느 단계에서 막혔는지는 아래 세 가지를 같이 봐야 알 수 있다.
 *   1) permissions API 가 말하는 권한 상태
 *   2) 실제로 잡히는 입력 장치 목록
 *   3) getUserMedia 를 실제로 호출했을 때의 오류 이름
 */
async function diagnoseMic() {
  const lines = [];
  const mark = (ok, text) => `<span class="${ok ? 'ok' : 'bad'}">${ok ? '정상' : '문제'}</span> ${text}`;

  // 1) 보안 컨텍스트
  const secure = window.isSecureContext;
  lines.push(mark(secure, `주소: ${location.origin} ${secure ? '(녹음 가능한 환경)' : '(보안 컨텍스트 아님)'}`));

  if (!navigator.mediaDevices?.getUserMedia) {
    lines.push(mark(false, '이 브라우저는 녹음(getUserMedia)을 지원하지 않습니다.'));
    return { html: lines.join('\n'), verdict: 'Chrome, Edge, Safari 최신 버전에서 열어주세요.' };
  }

  // 2) 사이트 권한 상태
  let permission = 'unknown';
  try {
    permission = (await navigator.permissions.query({ name: 'microphone' })).state;
  } catch {
    permission = 'unknown'; // 이 API 를 지원하지 않는 브라우저
  }
  const permText = { granted: '허용됨', denied: '차단됨', prompt: '아직 묻지 않음', unknown: '확인 불가' }[permission];
  lines.push(mark(permission !== 'denied', `사이트 권한: ${permText}`));

  // 3) 입력 장치
  let inputs = [];
  try {
    inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  } catch {
    /* 무시 */
  }
  lines.push(
    mark(inputs.length > 0, `입력 장치: ${inputs.length}개` + (inputs.length ? ` (${inputs.map((d) => d.label || '이름 없음').join(', ')})` : '')),
  );

  // 4) 실제로 열어본다
  let openError = null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch (e) {
    openError = e;
  }
  lines.push(mark(!openError, `마이크 열기: ${openError ? `실패 (${openError.name})` : '성공'}`));

  /*
   * 5) 녹음 형식
   * 브라우저마다 만들 수 있는 형식이 다르다(크롬 webm / 사파리 mp4).
   * 예전에는 webm 을 강제해서 사파리에서 녹음이 시작조차 안 됐다 — 여기서 바로 보이게 한다.
   */
  const recType = pickRecordOptions().mimeType;
  const canRecord = Boolean(window.MediaRecorder);
  lines.push(
    mark(
      canRecord,
      `녹음 형식: ${
        !canRecord ? 'MediaRecorder 미지원' : recType ?? '브라우저 기본값 (형식 질의 불가)'
      }`,
    ),
  );

  // 6) 결론
  let verdict;
  if (!canRecord) {
    verdict = '이 브라우저는 녹음(MediaRecorder)을 지원하지 않습니다. 크롬으로 열어주세요.';
  } else if (!openError) {
    verdict = '마이크는 정상입니다. 바로 녹음하시면 됩니다.';
  } else if (!secure) {
    verdict = 'http://localhost:4321 로 접속해야 녹음이 됩니다. 다른 주소로 열려 있습니다.';
  } else if (inputs.length === 0) {
    verdict = '마이크 장치 자체가 잡히지 않습니다. 연결 상태와 윈도우 소리 설정을 확인해주세요.';
  } else if (permission === 'denied') {
    verdict =
      '이 사이트의 마이크 권한이 차단돼 있습니다.\n' +
      '주소창 왼쪽 아이콘 → 마이크 → 허용으로 바꾸고 페이지를 새로고침해주세요.';
  } else if (openError.name === 'NotAllowedError') {
    // 사이트 권한은 있는데 막혔다면 그 위 단계(운영체제 또는 회사 정책)다
    verdict =
      '사이트 권한은 허용돼 있는데도 브라우저가 마이크를 열지 못했습니다.\n' +
      '브라우저보다 위 단계에서 막힌 경우입니다. 아래를 순서대로 확인해주세요.\n\n' +
      '1. 윈도우 설정 → 개인 정보 및 보안 → 마이크\n' +
      '   · "마이크 액세스" 켜기\n' +
      '   · "앱이 마이크에 액세스하도록 허용" 켜기\n' +
      '   · 목록에서 사용 중인 브라우저(Chrome/Edge)도 켜기\n' +
      '2. 설정을 바꿨다면 브라우저를 완전히 종료했다가 다시 켜기\n' +
      '3. 회사 PC라면 보안 정책으로 마이크가 막혀 있을 수 있습니다\n' +
      '   (chrome://policy 에서 AudioCaptureAllowed 항목 확인)\n\n' +
      '그래도 안 되면, 휴대폰 녹음기로 녹음한 파일을 public/audio 에 넣고\n' +
      'script.json 에 narrationAudio 로 지정하는 방법이 있습니다.';
  } else if (openError.name === 'NotReadableError' || openError.name === 'TrackStartError') {
    verdict =
      '장치는 있는데 열리지 않습니다. 다른 프로그램이 마이크를 쓰고 있을 가능성이 큽니다.\n' +
      '줌·팀즈·녹음기·디스코드 등을 모두 종료한 뒤 다시 시도해주세요.';
  } else {
    verdict = `예상치 못한 오류입니다: ${openError.name} — ${openError.message}`;
  }

  return { html: lines.join('\n'), verdict };
}

$('#btnMicCheck').addEventListener('click', async () => {
  const btn = $('#btnMicCheck');
  const box = $('#micReport');
  btn.disabled = true;
  btn.textContent = '점검 중…';
  box.classList.remove('hidden');
  box.textContent = '마이크를 확인하는 중입니다…';
  try {
    const { html, verdict } = await diagnoseMic();
    box.innerHTML = `${html}<span class="verdict">${escapeHtml(verdict)}</span>`;
  } catch (e) {
    box.textContent = `점검에 실패했습니다: ${e.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = '마이크 점검';
  }
});

/* ── 재생 속도 / 카드 사이 여백 ──────────────────────── */

/** 고른 값에 맞춰 버튼 강조를 갱신한다 */
function markTempo({ speed, gapSec }) {
  $$('#speedSeg button').forEach((b) => b.classList.toggle('on', Number(b.dataset.speed) === speed));
  $$('#gapSeg button').forEach((b) => b.classList.toggle('on', Number(b.dataset.gap) === gapSec));
}

/**
 * 설정을 저장하고 내레이션을 다시 합친다.
 * 길이 계산이 항상 녹음 파일·내레이션 글자 수에서 출발하므로,
 * 값을 여러 번 바꿔도 길이가 누적되지 않는다.
 */
async function applyTempo(next) {
  const buttons = $$('#speedSeg button, #gapSeg button');
  buttons.forEach((b) => (b.disabled = true));
  try {
    state.settings = await api('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    markTempo(state.settings);

    const build = await api('/api/audio/build', { method: 'POST' });
    state.script = await api('/api/script');
    renderFinal(build);
    toast(`전체 길이 ${fmtSec(build.totalSec)}`);
  } catch (e) {
    toast(e.message, true);
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

$('#speedSeg').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn || btn.disabled) return;
  applyTempo({ ...state.settings, speed: Number(btn.dataset.speed) });
});

$('#gapSeg').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn || btn.disabled) return;
  applyTempo({ ...state.settings, gapSec: Number(btn.dataset.gap) });
});
