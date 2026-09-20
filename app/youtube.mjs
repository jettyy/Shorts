/**
 * 유튜브 업로드.
 *
 * 외부 패키지를 쓰지 않는다(googleapis 등). Node 기본 fetch 만으로 처리한다.
 *
 * 흐름
 *  1. 사용자가 Google Cloud Console 에서 만든 "데스크톱 앱" OAuth 클라이언트 ID/시크릿을
 *     앱 화면에 붙여넣는다 → app/data/youtube.json 에 저장 (git 제외)
 *  2. 브라우저에서 구글 로그인 → 이 서버의 콜백으로 code 수신 → refresh token 저장
 *  3. 업로드는 resumable upload 로 진행하며 진행률을 알려준다
 *
 * ⚠️ 유튜브 정책
 *  심사를 받지 않은 API 프로젝트로 올린 영상은 강제로 비공개가 된다.
 *  그래서 UI 에서 이 사실을 먼저 알리고, 기본값을 비공개로 둔다.
 */
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL =
  'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
/**
 * 요청하는 권한.
 *  - youtube.upload   : 영상 업로드
 *  - youtube.readonly : **이미 예약해둔 영상들의 공개 예정 시각을 읽기 위해.**
 *    마지막 예약 뒤로 다음 예약 시각을 자동으로 잡아주는 데 쓴다.
 *
 * 권한을 더 늘리지 않는다. 늘리면 이미 연결해둔 계정이 전부 다시 로그인해야 한다.
 *
 * ⚠️ 이 기능이 생기기 전에 연결한 계정은 readonly 가 없다. 못 읽어도 업로드는
 *    그대로 되고, 추천 시각만 "지금 기준"으로 바뀐다.
 */
const SCOPE = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');

/** 업로드 1건당 소모되는 할당량 (기본 일일 한도 10,000) */
export const QUOTA_PER_UPLOAD = 1600;

export const createYouTube = (dataDir) => {
  const storePath = join(dataDir, 'youtube.json');

  const load = () => {
    try {
      return JSON.parse(readFileSync(storePath, 'utf8'));
    } catch {
      return {};
    }
  };
  const save = (data) => writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf8');

  /** 저장된 설정 상태 (시크릿은 절대 밖으로 내보내지 않는다) */
  const status = () => {
    const s = load();
    return {
      hasClient: Boolean(s.clientId && s.clientSecret),
      connected: Boolean(s.refreshToken),
      channelTitle: s.channelTitle ?? null,
      redirectUri: s.redirectUri ?? null,
    };
  };

  const setClient = ({ clientId, clientSecret }) => {
    const s = load();
    s.clientId = String(clientId ?? '').trim();
    s.clientSecret = String(clientSecret ?? '').trim();
    if (!s.clientId || !s.clientSecret) throw new Error('클라이언트 ID와 시크릿을 모두 입력해주세요.');
    // 클라이언트가 바뀌면 기존 연결은 무효다
    delete s.refreshToken;
    delete s.channelTitle;
    save(s);
  };

  const disconnect = () => {
    const s = load();
    delete s.refreshToken;
    delete s.channelTitle;
    save(s);
  };

  /** 구글 로그인 화면 주소 */
  const authUrl = (redirectUri) => {
    const s = load();
    if (!s.clientId) throw new Error('먼저 OAuth 클라이언트 ID/시크릿을 저장해주세요.');
    s.redirectUri = redirectUri;
    save(s);
    const params = new URLSearchParams({
      client_id: s.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent', // refresh token 을 확실히 받기 위해
      include_granted_scopes: 'true',
    });
    return `${AUTH_URL}?${params}`;
  };

  const postForm = async (url, body) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    }).catch(netFail('구글에 연결하는 중'));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error_description ?? data.error ?? `구글 응답 오류 (${res.status})`);
    }
    return data;
  };

  /** 로그인 후 돌아온 code 를 refresh token 으로 바꾼다 */
  const exchangeCode = async (code) => {
    const s = load();
    const data = await postForm(TOKEN_URL, {
      code,
      client_id: s.clientId,
      client_secret: s.clientSecret,
      redirect_uri: s.redirectUri,
      grant_type: 'authorization_code',
    });
    if (!data.refresh_token) {
      throw new Error(
        '리프레시 토큰을 받지 못했습니다. 구글 계정 설정에서 이 앱의 권한을 지운 뒤 다시 연결해주세요.',
      );
    }
    s.refreshToken = data.refresh_token;
    save(s);
    await fetchChannel(data.access_token).catch(() => {});
    return status();
  };

  const accessToken = async () => {
    const s = load();
    if (!s.refreshToken) throw new Error('유튜브 계정이 연결돼 있지 않습니다.');
    const data = await postForm(TOKEN_URL, {
      client_id: s.clientId,
      client_secret: s.clientSecret,
      refresh_token: s.refreshToken,
      grant_type: 'refresh_token',
    });
    return data.access_token;
  };

  /** 연결된 채널 이름을 저장해둔다 (화면에 보여주기용) */
  const fetchChannel = async (token) => {
    const res = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const title = data.items?.[0]?.snippet?.title;
    if (title) {
      const s = load();
      s.channelTitle = title;
      save(s);
    }
    return title ?? null;
  };

  /* ── 다음 예약 시각 자동 추천 ──────────────────────────────
   *
   * 예약을 몰아서 같은 시간대에 올리면 채널이 한 번에 쏟아졌다가 조용해진다.
   * 그래서 **이미 예약해둔 것 중 가장 늦은 시각을 찾아 그 뒤 3~5시간 사이**로 잡는다.
   * 정각에 몰리지 않게 분 단위 랜덤을 주되, 5분 단위로 떨어뜨린다.
   */

  const GAP_MIN_H = 3;
  const GAP_MAX_H = 5;

  const api = async (token, path) => {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(netFail('유튜브에 연결하는 중'));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(explain(data, res.status));
      err.status = res.status;
      err.reason = data.error?.errors?.[0]?.reason ?? '';
      throw err;
    }
    return data;
  };

  /**
   * 기준 시각에서 3~5시간 뒤, 5분 단위로.
   *
   * 시:분을 5분 단위로 맞추면 보기 좋지만, 반올림 때문에 **양쪽 끝을 넘을 수 있다.**
   *  - 내려가면 3시간보다 짧아진다 (예: 기준 +3시간 1분 → 3시간 0분 아래)
   *  - 올라가면 5시간보다 길어진다 (예: 기준 +4시간 58분 → 5시간 0분 위)
   * 그래서 넘은 쪽으로만 5분을 옮겨 **간격을 항상 3~5시간 안에 둔다.**
   */
  const randomSlotAfter = (base) => {
    const min = base.getTime() + GAP_MIN_H * 3600_000;
    const max = base.getTime() + GAP_MAX_H * 3600_000;
    const gap = (GAP_MIN_H + Math.random() * (GAP_MAX_H - GAP_MIN_H)) * 3600_000;
    const t = new Date(base.getTime() + gap);
    t.setSeconds(0, 0);
    t.setMinutes(Math.round(t.getMinutes() / 5) * 5);
    if (t.getTime() < min) t.setMinutes(t.getMinutes() + 5);
    if (t.getTime() > max) t.setMinutes(t.getMinutes() - 5);
    return t;
  };

  /**
   * 채널에 예약(비공개 + publishAt)된 영상 중 가장 늦은 공개 예정 시각을 찾는다.
   * 업로드 목록 최신 50개만 본다 — 예약은 보통 최근 업로드에 몰려 있다.
   */
  const latestScheduled = async (token) => {
    const ch = await api(token, 'channels?part=contentDetails&mine=true');
    const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) return null;

    const list = await api(
      token,
      `playlistItems?part=contentDetails&maxResults=50&playlistId=${uploads}`,
    );
    const ids = (list.items ?? []).map((i) => i.contentDetails?.videoId).filter(Boolean);
    if (!ids.length) return null;

    const videos = await api(token, `videos?part=status,snippet&id=${ids.join(',')}`);
    const scheduled = (videos.items ?? [])
      .filter((v) => v.status?.publishAt)
      .map((v) => ({ at: new Date(v.status.publishAt), title: v.snippet?.title ?? '' }))
      .filter((v) => !Number.isNaN(v.at.getTime()))
      .sort((a, b) => b.at - a.at);

    return scheduled.length ? { ...scheduled[0], count: scheduled.length } : null;
  };

  /**
   * 다음 예약 시각 추천.
   * 예약된 게 있으면 그 뒤, 없으면 지금 뒤로 3~5시간 사이를 고른다.
   * 목록을 못 읽어도(권한 부족 등) 추천 자체는 항상 돌려준다.
   */
  const nextSlot = async () => {
    const now = new Date();
    let last = null;
    let note = null;

    try {
      const token = await accessToken();
      last = await latestScheduled(token);
    } catch (e) {
      note =
        e.reason === 'insufficientPermissions'
          ? '예약 목록을 읽을 권한이 없습니다. [계정 다시 연결]을 누르면 마지막 예약 뒤로 자동 계산됩니다.'
          : `예약 목록을 읽지 못했습니다 — ${e.message}`;
    }

    // 이미 지난 예약을 기준으로 잡으면 과거 시각이 나온다 → 지금과 비교해 늦은 쪽
    const base = last && last.at > now ? last.at : now;
    return {
      suggested: randomSlotAfter(base).toISOString(),
      basedOn: last ? last.at.toISOString() : null,
      basedOnTitle: last?.title ?? null,
      scheduledCount: last?.count ?? 0,
      gapHours: [GAP_MIN_H, GAP_MAX_H],
      note,
    };
  };

  /**
   * fetch 가 네트워크 단계에서 실패했을 때 쓰는 래퍼.
   *
   * Node 의 fetch 는 어떤 이유로 실패하든 메시지가 **"fetch failed"** 한 줄이다.
   * 진짜 원인(끊김·DNS·타임아웃·길이 불일치 등)은 `error.cause` 에 들어 있어서
   * 그냥 e.message 를 보여주면 아무 단서도 안 남는다. 원인을 꺼내서 붙여준다.
   */
  const netFail = (what) => (e) => {
    /*
     * 원인이 한 겹이 아닐 때가 있다 (fetch failed → SocketError → ECONNRESET).
     * 겹을 끝까지 따라가서 **코드가 붙은 가장 안쪽 원인**까지 다 보여준다.
     * 한 겹만 꺼내면 "fetch failed — other side closed" 처럼 여전히 단서가 없다.
     */
    const seen = new Set();
    const layers = [];
    for (let cur = e; cur && !seen.has(cur); cur = cur.cause) {
      seen.add(cur);
      // 코드와 메시지면 충분하다 (errno·syscall 은 대개 메시지 안에 이미 들어 있다)
      const bits = [cur.code, cur.message].filter(Boolean).map(String);
      const line = [...new Set(bits)].join(' · ');
      if (line && !layers.includes(line)) layers.push(line);
    }
    const detail = layers.filter((l) => l !== 'fetch failed').join('\n      └ ');

    const err = new Error(
      `${what} 연결이 끊겼습니다.\n` +
        (detail ? `원인: ${detail}\n` : '') +
        '인터넷 연결을 확인하고 다시 시도해주세요. ' +
        '파일이 크면 업로드 도중 끊기기도 합니다.',
    );
    err.network = true; // 재시도해볼 만한 실패라는 표시
    err.cause = e;
    throw err;
  };

  /**
   * 유튜브가 돌려준 오류를 사람이 읽고 바로 고칠 수 있는 문장으로 바꾼다.
   *
   * 구글 오류는 영어 JSON 그대로 나와서 "뭘 어떻게 하라는 건지" 알기 어렵다.
   * 특히 아래 두 가지는 **설정 문제라 앱을 아무리 고쳐도 안 풀린다** — 할 일을 직접 알려준다.
   */
  const explain = (data, status) => {
    const err = data?.error ?? {};
    const reason = err.errors?.[0]?.reason ?? '';
    const message = String(err.message ?? '');

    // ① 프로젝트에 YouTube Data API v3 가 안 켜져 있다 (첫 업로드에서 가장 흔하다)
    if (reason === 'accessNotConfigured' || /has not been used in project|is disabled/i.test(message)) {
      const project = message.match(/project (\d+)/)?.[1];
      const link = project
        ? `https://console.developers.google.com/apis/api/youtube.googleapis.com/overview?project=${project}`
        : 'https://console.cloud.google.com/apis/library/youtube.googleapis.com';
      return (
        '이 구글 클라우드 프로젝트에 "YouTube Data API v3" 가 켜져 있지 않습니다.\n' +
        '공개·비공개 설정과는 상관없는 문제라, 켜기 전에는 어떤 방식으로도 올라가지 않습니다.\n\n' +
        `아래 주소에서 [사용 설정] 을 누르고, 2~3분 기다린 뒤 다시 시도해주세요.\n${link}\n\n` +
        '(반영에 몇 분 걸립니다. 바로 다시 누르면 같은 오류가 납니다)'
      );
    }

    // ② 이 구글 계정에 유튜브 채널이 없다
    if (reason === 'youtubeSignupRequired') {
      return (
        '이 구글 계정에 유튜브 채널이 없습니다.\n' +
        'youtube.com 에서 채널을 먼저 만들거나, 채널이 있는 계정으로 다시 연결해주세요.'
      );
    }

    // ③ 오늘 할당량 소진
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
      return (
        '오늘 할당량을 다 썼습니다. 유튜브 API 는 업로드 1건에 1600 units 를 쓰고\n' +
        '기본 한도가 하루 10,000 units 라 하루 약 6개까지만 올라갑니다.\n' +
        '내일 다시 시도하거나, 유튜브 스튜디오에서 직접 올려주세요.'
      );
    }

    // ④ 예약·공개를 걸 권한이 없다 (예전 권한으로 연결해둔 계정)
    if (reason === 'insufficientPermissions' || /insufficient (authentication|permission)/i.test(message)) {
      return (
        '이 연결에는 권한이 모자랍니다.\n' +
        '기능이 늘어나기 전에 연결해둔 계정이면 그럴 수 있습니다.\n\n' +
        '[계정 연결 해제] 를 누른 뒤 다시 연결해주세요.'
      );
    }

    // ⑤ 예약 시각이 잘못됐다
    if (/publishAt/i.test(message)) {
      return (
        '예약 시각을 유튜브가 거절했습니다. 앞으로의 시각인지 확인해주세요.\n' +
        `(유튜브 응답: ${message})`
      );
    }

    return message || `유튜브 응답 오류 (${status})`;
  };

  /**
   * 영상 업로드.
   * mode: 'public' | 'private' | 'schedule'
   * publishAt: schedule 일 때 ISO 8601 문자열
   *
   * ⚠️ **끊겼다고 처음부터 다시 보내지 않는다.**
   *
   * resumable 업로드는 본문이 다 도착한 뒤에도 응답을 못 받는 일이 있다. 그때
   * 다시 올리면 **새 세션이 열려서 같은 영상이 두 번 올라간다** — 실제로
   * 채널에 똑같은 영상이 두 개 생겼다(할당량도 3200 units 나갔다).
   *
   * 그래서 끊기면 **같은 세션에 "얼마나 받았냐"고 물어본다**(resumable 규약).
   * 이미 다 받았으면 유튜브가 그때 최종 응답을 그대로 돌려주므로,
   * 올라간 영상을 그대로 성공으로 처리할 수 있다.
   */
  const upload = async ({ filePath, meta, mode, publishAt, onProgress }) => {
    if (!existsSync(filePath)) throw new Error('업로드할 영상 파일이 없습니다.');
    return uploadOnce({ filePath, meta, mode, publishAt, onProgress });
  };

  /**
   * 끊긴 세션이 사실은 다 받았는지 물어본다.
   *
   * resumable 규약 — 본문 없이 `Content-Range: bytes * /전체크기` 로 PUT 하면
   *  - 아직 덜 받았으면 308 (+ Range 헤더로 받은 만큼)
   *  - 다 받았으면 200/201 과 **최종 응답(영상 정보)**
   * 두 번째 경우라면 올라간 것이므로 성공으로 처리한다.
   */
  const askSessionResult = async (sessionUrl, size) => {
    const res = await fetch(sessionUrl, {
      method: 'PUT',
      headers: { 'Content-Length': '0', 'Content-Range': `bytes */${size}` },
    }).catch(() => null);
    if (!res || !res.ok) return null; // 308(미완료) 포함 — 올라가지 않았다
    const data = await res.json().catch(() => ({}));
    return data.id ? data : null;
  };

  const uploadOnce = async ({ filePath, meta, mode, publishAt, onProgress }) => {
    const token = await accessToken();
    const size = statSync(filePath).size;

    // 예약 발행은 반드시 비공개 상태로 올려야 한다
    const privacyStatus = mode === 'public' ? 'public' : 'private';
    const body = {
      snippet: {
        title: (meta.title ?? '제목 없음').slice(0, 100),
        description: (meta.description ?? '').slice(0, 5000),
        tags: (meta.tags ?? []).slice(0, 15),
        categoryId: '22', // People & Blogs
      },
      status: {
        privacyStatus,
        selfDeclaredMadeForKids: false,
        ...(mode === 'schedule' && publishAt ? { publishAt } : {}),
      },
    };

    // 1) 업로드 세션 시작
    const start = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(size),
        'X-Upload-Content-Type': 'video/mp4',
      },
      body: JSON.stringify(body),
    }).catch(netFail('업로드를 시작하는 중'));
    if (!start.ok) {
      const text = await start.text();
      let parsed = {};
      try {
        parsed = JSON.parse(text);
      } catch {
        /* JSON 이 아니면 아래에서 상태 코드만 쓴다 */
      }
      throw new Error(explain(parsed, start.status));
    }
    const sessionUrl = start.headers.get('location');
    if (!sessionUrl) throw new Error('업로드 세션 주소를 받지 못했습니다.');

    /*
     * 2) 본문 전송 — 진행률을 보고한다
     *
     * ⚠️ 진행률을 재겠다고 `stream.on('data', …)` 를 붙이면 안 된다.
     *    리스너를 붙이는 순간 스트림이 flowing 모드로 바뀌어 곧바로 데이터를 흘리는데,
     *    fetch(undici)가 읽기 시작하기 전에 흘러나간 조각은 그대로 사라진다.
     *    그러면 실제 보낸 양이 Content-Length 보다 적어서 undici 가 요청을 끊고,
     *    화면에는 이유를 알 수 없는 "fetch failed" 만 뜬다
     *    (실제 원인은 UND_ERR_REQ_CONTENT_LENGTH_MISMATCH).
     *
     *    그래서 **보내는 쪽에서 직접 조각을 꺼내 세고 그대로 넘긴다.**
     *    yield 한 조각만 세므로 진행률도 실제 전송량과 정확히 같다.
     */
    let sent = 0;
    async function* readWithProgress() {
      for await (const chunk of createReadStream(filePath)) {
        sent += chunk.length;
        onProgress?.({ sent, total: size });
        yield chunk;
      }
    }

    const res = await fetch(sessionUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(size) },
      body: Readable.from(readWithProgress()),
      duplex: 'half',
    }).catch(async (e) => {
      /*
       * 끊겼다. 그런데 **이미 다 올라갔는데 응답만 못 받은 것일 수 있다.**
       * 다시 올리면 같은 영상이 두 번 생기므로, 먼저 세션에 물어본다.
       */
      const done = await askSessionResult(sessionUrl, size);
      if (done) {
        console.warn('[유튜브] 응답은 못 받았지만 업로드는 끝나 있었습니다.');
        return { ok: true, json: async () => done };
      }
      return netFail('영상 본문을 올리는 중')(e);
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(explain(data, res.status));

    return {
      id: data.id,
      url: `https://www.youtube.com/watch?v=${data.id}`,
      studioUrl: `https://studio.youtube.com/video/${data.id}/edit`,
      privacyStatus: data.status?.privacyStatus ?? privacyStatus,
      publishAt: data.status?.publishAt ?? null,
    };
  };

  return { status, setClient, disconnect, authUrl, exchangeCode, upload, nextSlot };
};
