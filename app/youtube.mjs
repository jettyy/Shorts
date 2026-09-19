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
const SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

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

  return { status, setClient, disconnect, authUrl, exchangeCode, upload };
};
