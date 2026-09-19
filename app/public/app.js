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
    checkedOn: $('#srcChecked').value || new Date().toISOString().slice(0, 10),
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
  $('#recCount').textContent = `${done} / ${total}장 녹음 완료`;
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
        '브라우저가 마이크 접근을 막았습니다.\n' +
        '주소창 왼쪽 자물쇠(또는 마이크 아이콘) → 마이크 → 허용으로 바꾼 뒤,\n' +
        '페이지를 새로고침하고 다시 눌러주세요.'
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

  // 세밀한 옵션이 장치와 안 맞아 실패하는 경우가 있어, 실패하면 기본 설정으로 한 번 더 시도한다
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
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
  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';
  state.recorder = new MediaRecorder(state.stream, { mimeType: mime });
  state.recorder.ondataavailable = (ev) => ev.data.size && state.chunks.push(ev.data);
  state.recorder.onstop = () => uploadClip(index);
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

async function uploadClip(index) {
  const blob = new Blob(state.chunks, { type: 'audio/webm' });
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
      headers: { 'Content-Type': 'audio/webm' },
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
  const recorded = Object.keys(state.clips).length;
  $('#finalInfo').innerHTML = [
    ['주제', s.topic ?? '-'],
    ['카드', `${s.cards.length}장`],
    ['전체 길이', fmtSec(build?.totalSec ?? s.cards.reduce((a, c) => a + c.durationSec, 0))],
    ['내레이션', recorded > 0 ? `${recorded}장 녹음 적용` : '없음 (무음)'],
    ['해상도', '1080 × 1920 · 30fps'],
  ]
    .map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`)
    .join('');

  if (build?.url && recorded > 0) {
    $('#audioPreview').classList.remove('hidden');
    $('#fullAudio').src = build.url;
  }
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
      $('#btnDownload').href = d.url;
      $('#btnDownload').setAttribute('download', d.file);
      $('#btnRender').disabled = false;
      toast('영상이 완성됐습니다');
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

$('#btnRestart').addEventListener('click', () => {
  $('#sourceText').value = '';
  $('#charCount').textContent = '0';
  $('#resultBox').classList.add('hidden');
  goStep(1);
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
  if (n === 4) renderFinal();
  goStep(n);
});

/* ── 시작 ────────────────────────────────────────────── */

(async () => {
  $('#srcChecked').value = new Date().toISOString().slice(0, 10);
  try {
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
      state.script = await api('/api/script');
      if (state.script?.cards?.length) {
        renderScript();
        toast(`이전 작업을 불러왔습니다 (카드 ${state.script.cards.length}장)`);
      }
    }
  } catch {
    $('#status').textContent = '서버 연결 실패';
  }
  goStep(1);
})();
