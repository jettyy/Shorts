# 이 저장소에서 작업할 때 (클로드코드용 지침)

## 이 프로젝트가 하는 일

기사·블로그 원문을 **도표가 들어간 해설형 세로 쇼츠**(1080×1920 mp4)로 만드는 Remotion 프로젝트다.

## 가장 중요한 두 가지

**1. 원문 → 대본 변환은 API를 호출하지 않는다. 클로드코드가 직접 한다.**
이 저장소에 Anthropic API 호출 코드, API 키, `.env`, `dotenv`를 **추가하지 않는다.**

**2. 결과물은 "기사 요약 자막 카드"가 되면 안 된다.**
유튜브가 수익화 불가로 명시한 "해설·교육적 가치가 거의 없는 이미지 슬라이드쇼"에
해당하지 않도록, 아래를 반드시 지킨다.
- 원문 문장을 그대로 옮기지 않는다. 사실과 숫자만 가져와 다시 쓴다.
- 카드마다 도표(`visual`)를 붙인다. 글자만 있는 카드는 1장 이하.
- **직접 계산(`type: "example"`)과 주의점(`type: "caveat"`) 카드를 반드시 넣는다.**
- 카드마다 `narration`을 쓰고, 녹음 대본을 만들어 사용자에게 안내한다.
- 주제가 바뀌면 `accent` 테마와 도표 종류를 바꾼다.

## 두 가지 사용 방식

1. **브라우저 앱** (`npm start` → http://localhost:4321) — 원문 입력·대본 확인·녹음·출력을
   화면에서 처리한다. 앱은 대본 생성을 위해 `claude -p` 를 호출한다(app/server.mjs).
2. **클로드코드에서 직접** — 아래 순서대로 한다.

## 원문을 받았을 때 할 일

1. **[CARD_RULES.md](./CARD_RULES.md) 와 [docs/VISUALS.md](./docs/VISUALS.md) 를 읽는다.**
2. 원문을 `.source/current.txt` 에 저장한다 (베낀 문장 자동 검사용, git 제외).
3. 규칙대로 `src/script.json` 을 덮어쓴다.
4. `npm run narration -- --fit` — 내레이션 길이에 맞춰 카드 길이 자동 조정.
5. `npm run check` — ERROR는 고치고, 💡 안내는 판단해서 반영.
6. `npm run render` — `output/카드뉴스_[주제]_[타임스탬프].mp4`
7. 사용자에게 **영상 경로 + 총 길이 + 녹음 대본 경로**를 알리고,
   목소리를 얹는 방법(README의 "내레이션 녹음해서 얹기")을 안내한다.

## 앱(app/) 관련 메모

- `app/server.mjs` 는 의존성 없이 node 기본 모듈만 쓴다. 패키지를 추가하지 않는다.
- ffmpeg/ffprobe 는 `node_modules/@remotion/compositor-*/` 의 바이너리를 직접 호출한다.
  (`npx remotion ffmpeg` 는 호출당 1.4초가 들어서 쓰지 않는다. 못 찾으면 npx 로 폴백)
- 녹음 길이는 `app/data/clips/meta.json` 에 캐시된다.
- 렌더 직전에 항상 내레이션을 다시 합치므로(`buildAudio`), 녹음과 영상이 어긋나지 않는다.
- `app/data/` 는 git 제외 대상이다.

## 건드리지 말 것

- `src/components/` 의 디자인은 재사용 템플릿이다. 새 주제를 만들 때는 손대지 않는다.
- 도표 색은 색각이상·대비 검증을 거쳤다(`src/components/chartTheme.ts`).
  "하나만 강조, 나머지는 회색" 원칙을 깨지 않는다.
- 새 도표 종류를 추가할 때만 `src/components/visuals/` 에 파일을 만들고
  `types.ts` 의 `Visual` 유니온과 `visuals/index.tsx` 분기에 등록한다.

## 환경 메모

- 렌더링에 Chrome/Chromium이 필요하다. 자동 다운로드가 막힌 환경에서는
  `scripts/find-browser.mjs` 가 설치된 브라우저를 찾아 쓴다.
  직접 지정하려면 `REMOTION_BROWSER_EXECUTABLE` 환경변수.
- 한글 폰트는 `npm install` 시 node_modules에서 `public/fonts/` 로 복사된다. 외부 CDN 미사용.
