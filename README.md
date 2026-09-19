# 해설형 정보 쇼츠 자동 제조 프로그램

기사·블로그 글을 붙여넣으면, **클로드코드가 직접 분석해서 도표가 들어간
세로형(1080×1920) 쇼츠 영상**을 만들어주는 프로젝트입니다.

- 📊 **도표 중심** — 막대·꺾은선·도넛·관계도·계산표·체크리스트·타임라인 9종
- 🎙 **내레이션 녹음 대본 자동 생성** — 직접 녹음해서 얹으면 완성
- 🔑 **API 키 필요 없음** — 분석은 클로드코드가 직접 합니다. `.env`도, 과금도 없습니다
- ♻️ **재사용 템플릿** — 새 주제는 `src/script.json`만 갈아끼우면 끝

---

## ⚠️ 먼저 알아야 할 것 — 왜 "그냥 카드뉴스"가 아닌가

유튜브는 **"설명·해설·교육적 가치가 거의 없는 이미지 슬라이드쇼 또는 스크롤 텍스트"**를
수익화 불가 사례로 명시합니다. 개별 영상이 아니라 **채널 전체**를 보고 판단합니다.

기사를 AI로 요약해서 자막 카드만 넘기는 영상을 반복 업로드하면 위험합니다.
그래서 이 프로젝트는 처음부터 **요약본이 아닌 해설 영상**이 나오도록 설계돼 있습니다.

| 위험한 방식 | 이 프로젝트의 방식 |
| --- | --- |
| 원문 문장을 그대로 옮김 | 사실만 가져와 다시 씀 (`npm run check`가 베낀 문장 검사) |
| 글자만 넘어감 | 카드마다 도표·그래프 |
| 요약으로 끝 | **직접 계산(`example`) + 주의점(`caveat`)** 카드 필수 |
| 해설 없음 | 카드마다 내레이션, 녹음 대본 자동 생성 |
| 영상마다 똑같은 화면 | 주제별 테마 5종 + 도표 9종 조합 |
| 출처 불명 | 마지막 카드에 출처·확인 기준일 자동 표기 |

**그래도 승인을 보장할 수는 없습니다.** 최종 판단은 유튜브가 합니다.
다만 "직접 조사·해설했다"는 근거를 영상 안에 남기는 것이 핵심이고,
그 근거를 만들기 쉽게 도구를 짜뒀습니다.

> 가장 효과가 큰 한 가지: **본인 목소리 녹음을 얹는 것.**
> 앱 3단계에서 대본을 보면서 바로 녹음하고, 들어보고, 다시 녹음할 수 있습니다.

---

## 🚀 이렇게 씁니다 — 브라우저 앱

```bash
npm install   # 처음 한 번만 (필수)
npm start
```

브라우저에서 **http://localhost:4321** 을 열면 4단계 화면이 나옵니다.

> ⚠️ **`npm install` 을 빼먹으면** 서버는 켜지고 대본까지는 만들어지지만,
> 녹음 합치기와 영상 렌더링에서 실패합니다.
> 그래서 서버가 켜질 때와 앱 첫 화면에서 설치가 덜 됐는지 먼저 알려줍니다.

### 1단계 · 원문 붙여넣기
기사나 블로그 글을 통째로 붙여넣고, 출처(제목·매체·URL·확인 기준일)와
영상 테마·카드 장수를 고른 뒤 **[대본 만들기]**.

> 설치된 **Claude Code CLI**를 호출해서 분석합니다. 별도 API 키도, 추가 과금도 없습니다.
> CLI가 없으면 자동으로 수동 모드로 바뀝니다 —
> 지시문을 복사해서 클로드에 붙여넣고, 받은 JSON을 다시 붙여넣으면 됩니다.

### 2단계 · 대본 확인
카드별로 제목과 내레이션을 그 자리에서 고칠 수 있습니다.
**[미리보기]** 를 누르면 그 카드가 실제로 어떻게 보이는지 이미지로 확인됩니다.

### 3단계 · 녹음 🎙
카드마다 **대본이 크게 표시되고, 바로 아래에 녹음 버튼**이 있습니다.

- **[● 녹음 시작]** → 대본을 읽고 → **[■ 녹음 멈추기]** (스페이스바로도 멈춤)
- 바로 **재생해서 들어볼 수 있고**, 마음에 안 들면 **[다시 녹음]**
- 마음에 들면 다음 카드로. 상단 막대로 진행 상황이 보입니다
- **카드 길이는 녹음 길이에 맞춰 자동으로 조정됩니다** — 싱크를 맞출 필요가 없습니다
- 녹음을 건너뛴 카드는 무음으로 처리되니, 일부만 녹음해도 됩니다

### 4단계 · 최종 출력
합쳐진 내레이션을 **전체로 한 번 들어보고**, **[최종 영상 만들기]** 를 누르면
진행률이 표시되면서 렌더링됩니다. 끝나면 그 자리에서 **재생해보고 내려받기**.

---

## 📦 처음 한 번만: 설치

### 1. Node.js 확인

```bash
node -v    # v18 이상이면 OK
```
없으면 https://nodejs.org 에서 **LTS 버전** 설치 (설치 후 터미널 새로 열기).

### 2. 프로젝트 가져오기

```bash
cd C:\Users\정대진\Claude
git clone https://github.com/jettyy/Shorts shorts-automation
cd shorts-automation
npm install
```

`npm install` 이 끝나면 한글 폰트(Pretendard)가 자동으로 복사됩니다.
첫 렌더 때 Remotion이 렌더링용 Chrome을 한 번 내려받습니다(약 150MB).

---

## 🛠 명령어

| 명령어 | 하는 일 |
| --- | --- |
| **`npm start`** | **브라우저 앱 실행 (http://localhost:4321)** |
| `npm run render` | `src/script.json` → `output/카드뉴스_[주제]_[타임스탬프].mp4` |
| `npm run narration` | 녹음용 내레이션 대본 생성 → `output/내레이션_*.md` |
| `npm run narration -- --fit` | 읽는 속도에 맞춰 각 카드 길이를 자동 재계산 |
| `npm run check` | 구조 검사 + "양산형으로 보일 위험" 점검 |
| `npm run studio` | 브라우저 미리보기 + 타임라인 편집기 |
| `npm run still -- 100` | 100번 프레임 한 장만 PNG로 확인 |

---

## ⌨️ 클로드코드에서 직접 쓰기 (앱 없이)

앱을 띄우지 않고 클로드코드에서 바로 작업할 수도 있습니다.
프로젝트 폴더에서 클로드코드를 켜고:

```
이 글로 쇼츠 만들어줘: [기사 전문 붙여넣기]
```

이때 쓰이는 명령들:

```bash
npm run narration           # 녹음용 대본 생성 → output/내레이션_*.md
npm run narration -- --fit  # 읽는 속도에 맞춰 카드 길이 재계산
npm run check               # 구조·독창성 점검
npm run render              # 렌더링
```

직접 녹음한 파일을 수동으로 얹으려면 `public/audio/` 에 넣고
`src/script.json` 에 `"narrationAudio": "audio/내파일.mp3"` 를 추가하면 됩니다.
(앱의 3단계를 쓰면 이 과정이 전부 자동입니다.)

## 📁 폴더 구조

```
shorts-automation/
├── src/
│   ├── script.json              ← ⭐ 대본. 새 주제마다 이것만 바뀝니다
│   ├── Root.tsx                 컴포지션 등록 (1080×1920, 30fps)
│   ├── theme.ts                 색 테마 5종 + 여백·타이포 토큰
│   ├── chartTheme.ts            차트 전용 색·치수 (검증된 팔레트)
│   ├── types.ts                 script.json 타입 정의
│   ├── lib/text.ts              한글 줄바꿈 + 폰트 크기 자동 맞춤
│   └── components/
│       ├── CardNews.tsx         카드 연결 + 내레이션 오디오
│       ├── Card.tsx             ⭐ 카드 한 장 (제목 + 도표 + 출처)
│       ├── Background.tsx       테마별 그라데이션 배경
│       ├── ProgressBar.tsx      하단 진행 바
│       └── visuals/             ⭐ 도표 9종
│           ├── StatVisual.tsx        핵심 숫자
│           ├── BarVisual.tsx         가로 막대그래프
│           ├── TrendVisual.tsx       꺾은선 그래프
│           ├── DonutVisual.tsx       도넛 (비중)
│           ├── FlowVisual.tsx        관계 도표 (화살표 연결)
│           ├── CalcVisual.tsx        계산 내역
│           ├── ChecklistVisual.tsx   해당/비해당
│           ├── TableVisual.tsx       2열 비교표
│           └── TimelineVisual.tsx    시점별 변화
├── app/                         ⭐ 브라우저 앱
│   ├── server.mjs               로컬 서버 (분석·녹음·합성·렌더)
│   ├── prompt.mjs               대본 생성 지시문
│   └── public/                  UI (index.html / app.css / app.js)
├── scripts/
│   ├── render.mjs               렌더 자동화
│   ├── narration.mjs            녹음 대본 생성 / 길이 자동 조정
│   ├── check-script.mjs         구조·독창성 점검
│   ├── setup-fonts.mjs          폰트 복사 (자동 실행)
│   └── find-browser.mjs         렌더용 Chrome 탐색
├── docs/
│   ├── VISUALS.md               ⭐ 도표 9종 사용법
│   ├── examples/charts-demo.json   도표 렌더 확인용 데모
│   └── sample-source.md         예시용 샘플 원문
├── public/audio/                녹음한 내레이션 (git 제외)
├── .source/                     분석용 원문 (git 제외)
├── output/                      완성 영상 (git 제외)
├── CARD_RULES.md                ⭐ 대본 작성 규칙 (클로드코드 지시서)
└── CLAUDE.md                    세션 자동 참조용 지침
```

---

## 🎨 디자인 스펙

| 항목 | 값 |
| --- | --- |
| 해상도 / 프레임 | 1080 × 1920 (9:16), 30fps |
| 배경 | 진한 네이비 그라데이션 + 테마색 글로우 + 비네트 |
| 테마 | `gold` / `mint` / `coral` / `violet` / `ice` |
| 폰트 | Pretendard (Medium / Bold / ExtraBold / Black) |
| 제목 | 최대 3줄, 글자 수에 따라 자동 축소. 도표가 있으면 더 작게 |
| 등장 | 아래→위 이동 + 페이드인 + 스프링 확대, 줄 단위 시간차 |
| 전환 | 앞 카드는 위로, 뒤 카드는 아래에서 (컨베이어식) |
| 강조 | 제목 아래 테마색 언더라인이 좌→우로 그려짐 |
| 차트 색 | "하나만 강조, 나머지는 회색" — 색각이상·대비 검증 완료 |
| 안전 영역 | 하단 232px 비움 (쇼츠 UI가 덮는 구간) |
| 출처 | 마지막 카드 하단에 매체·제목·확인 기준일 자동 표기 |

---

## ❓ 자주 막히는 곳

**렌더링할 때 Chrome 다운로드가 실패해요**
```powershell
$env:REMOTION_BROWSER_EXECUTABLE="C:\Program Files\Google\Chrome\Application\chrome.exe"
npm run render
```

**글자가 네모(□)로 나와요** → `node scripts/setup-fonts.mjs` 실행

**영상이 너무 길어요** → 내레이션을 줄이고 `npm run narration -- --fit`

**도표가 안 나와요** → `npm run check` 로 `visual` 형식 확인, [docs/VISUALS.md](./docs/VISUALS.md) 참고

**앱에서 마이크가 안 잡혀요**
→ 브라우저 주소창의 자물쇠 아이콘에서 마이크를 허용해주세요.
   `localhost` 는 보안 컨텍스트로 취급되므로 https 없이도 녹음이 됩니다.

**"대본 생성 수동 모드"로 표시돼요**
→ Claude Code CLI를 찾지 못한 경우입니다. 설치돼 있다면 `claude --version` 이
   터미널에서 되는지 확인하세요. 수동 모드로도 전부 쓸 수 있습니다.

**포트 4321이 이미 쓰이고 있어요**
```bash
PORT=5000 npm start          # macOS / Linux
$env:PORT=5000; npm start    # Windows PowerShell
```

**"설치가 덜 됐습니다" 빨간 안내가 떠요**
→ `npm install` 을 아직 안 했거나 중간에 실패한 경우입니다.
   터미널에서 `Ctrl+C` 로 서버를 끄고, 프로젝트 폴더에서 `npm install` 을 실행한 뒤
   `npm start` 로 다시 켜주세요. 어떤 게 빠졌는지는 안내에 그대로 적혀 있습니다.

**`npm error could not determine executable to run`**
→ 같은 원인입니다(패키지 미설치). `npm install` 후 다시 시도하세요.

**`npm error EACCES ... ~/.npm/_cacache`** (맥)
→ npm 캐시 폴더에 root 소유 파일이 섞인 경우입니다.
   과거에 `sudo npm install` 을 한 번이라도 쓰면 이렇게 됩니다.
```bash
sudo chown -R $(whoami) ~/.npm
npm install
```
   sudo 를 쓰기 싫으면 캐시를 따로 쓰면 됩니다: `npm install --cache ~/.npm-shorts`

**`Library not loaded: libavdevice.dylib`** (맥)
→ 고쳐졌습니다. `git pull` 후 다시 실행하세요.
   ffmpeg 가 쓰는 라이브러리는 바이너리 옆에 있는데, macOS 는 이를 작업 디렉터리
   기준으로 찾습니다. 이제 바이너리가 있는 폴더에서 실행합니다.
