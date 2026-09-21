/**
 * 배경음악 목록.
 *
 * 저작권 없는 음원을 저장소에 넣어두고 영상마다 골라 쓴다.
 *
 * **놓아둘 곳은 `public/bgm/` 이다.**
 *  - `public/audio/` 에 두면 안 된다. 거기는 합친 내레이션이 들어가는 작업 폴더라
 *    **[전부 지우고 처음부터] 를 누르면 통째로 지워진다.** 음악 라이브러리가 날아간다.
 *    (git 제외 대상이기도 해서 저장소에 올라가지도 않는다)
 *  - 예전에 `config/` 에 올려둔 파일도 읽는다 — 다시 올리게 하지 않으려고.
 *    `config/` 는 원래 설정 파일 자리라 권장하지는 않는다.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));

/** 찾아보는 폴더 (앞에 있는 곳이 우선 — 같은 이름이면 앞쪽을 쓴다) */
const DIRS = [
  join(root, 'public', 'bgm'), // 권장
  join(root, 'config', 'bgm'),
  join(root, 'config'), // 여기 올려둔 사람을 위해
];

const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.opus', '.flac']);

/** 길이는 재는 데 시간이 걸려서 캐시해둔다 (파일 크기·수정시각이 그대로면 재사용) */
const CACHE_PATH = join(root, 'app', 'data', 'bgm-meta.json');
const readCache = () => {
  try {
    return JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
};

/**
 * 고른 음원 파일의 실제 경로를 돌려준다.
 *
 * ⚠️ **이름을 그대로 경로에 붙이면 안 된다.** `../../` 같은 걸 넣으면 저장소 밖 파일을
 *    읽게 된다. 파일 이름만 떼어내고(basename), **목록에 실제로 있는 것과 맞을 때만**
 *    돌려준다. 목록에 없는 이름은 무조건 null 이다.
 */
export const resolveTrack = (name) => {
  if (!name) return null;
  const safe = basename(String(name));
  for (const dir of DIRS) {
    const p = join(dir, safe);
    if (existsSync(p) && statSync(p).isFile() && AUDIO_EXT.has(extname(p).toLowerCase())) {
      return p;
    }
  }
  return null;
};

/** 보기 좋은 이름 — 확장자를 떼고 밑줄을 공백으로 */
const prettyName = (file) => file.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();

/**
 * 쓸 수 있는 음원 목록.
 * @param probe 길이를 재는 함수 (없으면 길이 없이 목록만)
 */
export const listTracks = async (probe) => {
  const seen = new Set();
  const found = [];

  for (const dir of DIRS) {
    if (!existsSync(dir)) continue;
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const file of entries.sort((a, b) => a.localeCompare(b, 'ko'))) {
      if (!AUDIO_EXT.has(extname(file).toLowerCase())) continue;
      if (seen.has(file)) continue; // 앞쪽 폴더가 우선
      const full = join(dir, file);
      let size = 0;
      try {
        const st = statSync(full);
        if (!st.isFile()) continue;
        size = st.size;
      } catch {
        continue;
      }
      seen.add(file);
      found.push({ file, name: prettyName(file), size, path: full });
    }
  }

  if (!probe) return found.map(({ path, ...rest }) => rest);

  // 길이 재기 — 캐시에 있으면 그대로 쓴다
  const cache = readCache();
  let dirty = false;
  const out = [];
  for (const t of found) {
    const key = `${t.file}:${t.size}`;
    let duration = cache[key];
    if (duration === undefined) {
      duration = await probe(t.path).catch(() => 0);
      cache[key] = duration;
      dirty = true;
    }
    const { path, ...rest } = t;
    out.push({ ...rest, duration });
  }
  if (dirty) {
    try {
      writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf8');
    } catch {
      /* 캐시를 못 써도 목록은 나와야 한다 */
    }
  }
  return out;
};

/** 목록에서 무작위로 하나 — 영상마다 다른 곡이 깔리게 */
export const pickRandom = (tracks, exclude) => {
  const pool = tracks.filter((t) => t.file !== exclude);
  const from = pool.length ? pool : tracks;
  return from.length ? from[Math.floor(Math.random() * from.length)].file : '';
};
