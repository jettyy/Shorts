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

$('#btnAnalyze').addEventListener('click', async () => {
  const input = collectInput();
  if (input.text.length < 100) return toast('원문이 너무 짧습니다. 기사 전체를 붙여넣어 주세요.', true);

  $('#analyzeNote').textContent = '';
  busy('원문을 읽고 대본을 만드는 중입니다… (1~2분 걸릴 수 있습니다)');
  try {
    const { script } = await api('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    state.script = script;
    renderScript();
    goStep(2);
    toast(`대본 ${script.cards.length}장을 만들었습니다`);
  } catch (e) {
    $('#analyzeNote').className = 'note err';
    $('#analyzeNote').textContent = e.message;
    $('#manualBox').classList.remove('hidden');
    toast('자동 생성에 실패했습니다. 수동 모드를 쓰세요.', true);
  } finally {
    idle();
  }
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

async function startRecording(index, btn) {
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    return toast('마이크 권한이 필요합니다. 브라우저 주소창의 자물쇠에서 허용해주세요.', true);
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
