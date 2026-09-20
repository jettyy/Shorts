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
 * ⚠️ 권한을 늘렸으므로, 예전에 연결한 계정은 한 번 다시 연결해야 목록을 읽을 수 있다.
 *    못 읽어도 업로드는 그대로 되고, 추천 시각만 "지금 기준"으로 바뀐다.
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
    });
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
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error?.message ?? `유튜브 응답 오류 (${res.status})`);
      err.status = res.status;
      err.reason = data.error?.errors?.[0]?.reason ?? '';
      throw err;
    }
    return data;
  };

  /** 기준 시각에서 3~5시간 뒤, 5분 단위로 */
  const randomSlotAfter = (base) => {
    const gap = (GAP_MIN_H + Math.random() * (GAP_MAX_H - GAP_MIN_H)) * 3600_000;
    const t = new Date(base.getTime() + gap);
    t.setSeconds(0, 0);
    t.setMinutes(Math.round(t.getMinutes() / 5) * 5);
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
        e.status === 403
          ? '예약 목록을 읽을 권한이 없습니다. [계정 다시 연결]을 누르면 마지막 예약 뒤로 자동 계산됩니다.'
          : `예약 목록을 읽지 못했습니다 (${e.message})`;
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
   * 영상 업로드.
   * mode: 'public' | 'private' | 'schedule'
   * publishAt: schedule 일 때 ISO 8601 문자열
   */
  const upload = async ({ filePath, meta, mode, publishAt, onProgress }) => {
    if (!existsSync(filePath)) throw new Error('업로드할 영상 파일이 없습니다.');
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
    });
    if (!start.ok) {
      const text = await start.text();
      throw new Error(`업로드 시작 실패 (${start.status})\n${text.slice(0, 400)}`);
    }
    const sessionUrl = start.headers.get('location');
    if (!sessionUrl) throw new Error('업로드 세션 주소를 받지 못했습니다.');

    // 2) 본문 전송 — 진행률을 보고한다
    let sent = 0;
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => {
      sent += chunk.length;
      onProgress?.({ sent, total: size });
    });

    const res = await fetch(sessionUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(size) },
      body: stream,
      duplex: 'half',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = data.error?.errors?.[0]?.reason ?? '';
      if (reason === 'quotaExceeded') {
        throw new Error(
          '오늘 할당량을 다 썼습니다. 유튜브 API 는 업로드 1건에 1600 units 를 쓰고\n' +
            '기본 한도가 하루 10,000 units 라 하루 약 6개까지만 올라갑니다.',
        );
      }
      throw new Error(data.error?.message ?? `업로드 실패 (${res.status})`);
    }

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
