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
> `npm run narration` 으로 대본이 나오니 읽어서 녹음만 하면 됩니다.

---

## 🚀 이렇게 씁니다 (핵심)

**이 프로젝트 폴더에서 클로드코드를 켜고, 이렇게 말하면 됩니다.**

```
이 글로 쇼츠 만들어줘:

[여기에 기사나 블로그 글 전체를 그대로 붙여넣기 — 길이 상관없음]
```

그러면 클로드코드가 알아서:

1. 원문에서 **사실과 숫자만** 뽑아내고 (문장은 다시 씁니다)
2. 직접 계산할 거리와 원문이 빠뜨린 주의점을 찾아
3. **7장짜리 대본 + 카드별 도표**(`src/script.json`)를 구성하고
4. **녹음용 내레이션 대본**(`output/내레이션_*.md`)을 만들고
5. `npm run render` 로 **mp4**를 뽑아줍니다

그 다음 **대본을 보고 녹음**해서 `public/audio/`에 넣고,
`script.json`에 `"narrationAudio": "audio/파일명.mp3"` 한 줄 추가 후 다시 렌더하면 끝입니다.

> 💡 같이 말해도 됩니다: `"테마는 coral로"`, `"계산 사례 더 넣어줘"`, `"40초로 맞춰줘"`

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
| `npm run render` | `src/script.json` → `output/카드뉴스_[주제]_[타임스탬프].mp4` |
| `npm run narration` | 녹음용 내레이션 대본 생성 → `output/내레이션_*.md` |
| `npm run narration -- --fit` | 읽는 속도에 맞춰 각 카드 길이를 자동 재계산 |
| `npm run check` | 구조 검사 + "양산형으로 보일 위험" 점검 |
| `npm run studio` | 브라우저 미리보기 + 타임라인 편집기 |
| `npm run still -- 100` | 100번 프레임 한 장만 PNG로 확인 |

---

## 🎙 내레이션 녹음해서 얹기

```bash
npm run narration        # output/내레이션_*.md 생성
```

1. 나온 대본을 읽으면서 **하나의 파일로** 녹음합니다 (휴대폰 녹음도 충분합니다).
2. mp3를 `public/audio/` 에 넣습니다.
3. `src/script.json` 최상단에 한 줄 추가:
   ```json
   "narrationAudio": "audio/내파일.mp3"
   ```
4. `npm run render` — 목소리가 깔린 영상이 나옵니다.

타이밍이 안 맞으면 `npm run narration -- --fit` 을 돌리세요.
읽는 속도(초당 5.2자)에 맞춰 카드 길이를 다시 잡아줍니다.

---

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
