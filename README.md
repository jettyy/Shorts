# 카드뉴스형 쇼츠 자동 제조 프로그램

긴 기사·블로그 글을 붙여넣으면, **클로드코드가 그 자리에서 카드 대본을 만들고
세로형(1080×1920) 쇼츠 영상까지 뽑아주는** 프로젝트입니다.

- 🔑 **API 키 필요 없음** — 텍스트 분석은 클로드코드가 직접 합니다. `.env`도, 과금도 없습니다.
- 🎬 **렌더링만 자동화** — `npm run render` 한 줄이면 mp4가 나옵니다.
- ♻️ **재사용 템플릿** — 새 주제는 `src/script.json`만 갈아끼우면 끝입니다.

---

## 🚀 이렇게 씁니다 (핵심)

**이 프로젝트 폴더에서 클로드코드를 켜고, 이렇게 말하면 됩니다.**

```
이 글로 카드뉴스 쇼츠 만들어줘:

[여기에 기사나 블로그 글 전체를 그대로 붙여넣기 — 길이 상관없음]
```

그러면 클로드코드가 알아서:

1. 원문을 읽고 **가장 후킹되는 부분 + 핵심 정보**만 추려서
2. `CARD_RULES.md` 규칙대로 **6~8장짜리 카드 대본**(`src/script.json`)을 작성하고
3. `npm run render`를 실행해 **`output/카드뉴스_[주제]_[타임스탬프].mp4`** 를 만들어줍니다.

끝입니다. 명령어를 직접 칠 일은 없습니다.

> 💡 톤을 바꾸고 싶으면 같이 말하면 됩니다.
> 예: `"좀 더 자극적인 훅으로"`, `"CTA는 팔로우 유도로"`, `"카드 6장으로 짧게"`

---

## 📦 처음 한 번만: 설치

### 1. Node.js 설치 확인

```bash
node -v    # v18 이상이면 OK
npm -v
```

안 깔려 있다면 https://nodejs.org 에서 **LTS 버전**을 받아 설치하세요.
(설치 후 터미널을 새로 열어야 `node` 명령이 잡힙니다.)

### 2. 프로젝트 가져오기 + 패키지 설치

```bash
cd C:\Users\정대진\Claude
git clone <이 저장소 주소> shorts-automation
cd shorts-automation
npm install
```

`npm install`이 끝나면 한글 폰트(Pretendard)가 `public/fonts/`에 자동으로 복사됩니다.
**추가로 받을 폰트나 설정 파일은 없습니다.**

> 첫 `npm run render` 때 Remotion이 렌더링용 Chrome을 한 번 자동으로 내려받습니다(약 150MB).
> 이미 Chrome이 깔려 있는 환경이라면 `scripts/find-browser.mjs`가 그걸 찾아 씁니다.

---

## 🛠 명령어

| 명령어 | 하는 일 |
| --- | --- |
| `npm run render` | `src/script.json` → `output/카드뉴스_[주제]_[타임스탬프].mp4` |
| `npm run check` | 대본이 규칙(줄 수·길이·훅/CTA)을 지키는지 검사 |
| `npm run studio` | 브라우저 미리보기 + 타임라인 편집기 실행 |
| `npm run still -- 35` | 35번 프레임 한 장만 PNG로 뽑아 디자인 확인 |

---

## 📁 폴더 구조

```
shorts-automation/
├── src/
│   ├── script.json           ← ⭐ 카드 대본. 새 주제마다 이것만 바뀝니다
│   ├── Root.tsx              컴포지션 등록 (1080×1920, 30fps, 길이 자동 계산)
│   ├── theme.ts              색·여백·타이포 토큰 (톤 변경은 여기서)
│   ├── types.ts              script.json 타입 정의
│   ├── fonts.ts              Pretendard 로컬 로딩
│   ├── lib/text.ts           한글 줄바꿈 + 폰트 크기 자동 맞춤
│   └── components/
│       ├── CardNews.tsx      카드들을 이어붙이는 컴포지션
│       ├── Card.tsx          ⭐ 카드 한 장 디자인 (재사용 템플릿)
│       ├── Background.tsx    남색 그라데이션 배경 + 골드 글로우
│       └── ProgressBar.tsx   하단 진행 바
├── scripts/
│   ├── render.mjs            렌더 자동화 (타임스탬프 파일명)
│   ├── check-script.mjs      대본 규칙 검사
│   ├── setup-fonts.mjs       폰트 복사 (postinstall 자동 실행)
│   ├── find-browser.mjs      렌더용 Chrome 탐색
│   └── still.mjs             프레임 한 장 미리보기
├── docs/
│   └── sample-source.md      예시용 샘플 원문
├── output/                   완성 영상 (git에 올라가지 않음)
├── CARD_RULES.md             ⭐ 카드 대본 작성 규칙 (클로드코드 지시서)
└── README.md
```

---

## 🎨 디자인 스펙

| 항목 | 값 |
| --- | --- |
| 해상도 / 프레임 | 1080 × 1920 (9:16), 30fps |
| 배경 | 진한 네이비 그라데이션 + 상단 골드 글로우 + 비네트 |
| 포인트 컬러 | 골드 `#E8B44A` / `#FFD874` |
| 폰트 | Pretendard (Medium 500 / Bold 700 / ExtraBold 800 / Black 900) |
| 제목 | 최대 3줄, 글자 수에 따라 52~124px 자동 조절 |
| 등장 애니메이션 | 아래→위 이동 + 페이드인 + 0.94→1 확대 (스프링), 줄 단위 시간차 |
| 강조 연출 | 제목 아래 **골드 언더라인이 왼쪽에서 오른쪽으로 그려짐** |
| 훅 카드 | 폰트 크기 확대 (최대 124px), Black 900 |
| CTA 카드 | 텍스트 골드 컬러 + 글로우, 보조 문구 추가 |
| 카드 번호 | 우측 상단 `1 / 7` (숫자만 골드) |
| 안전 영역 | 하단 232px은 비움 — 유튜브 쇼츠 UI가 덮는 구간 |

**카드 개수·텍스트·타이밍만 바뀌면 그대로 새 영상이 나옵니다.**
디자인 파일은 건드릴 필요가 없습니다.

---

## 📝 카드 대본 직접 수정하기

클로드코드에게 맡기지 않고 직접 고치고 싶다면 `src/script.json`을 열어 수정하세요.

```json
{
  "topic": "모두의카드 포인트",
  "cards": [
    {
      "kicker": "몰라서 못 받는 돈",
      "title": "안 쓰는 카드 포인트\n1년 뒤엔 그냥 사라집니다",
      "isHook": true,
      "durationSec": 4.6
    },
    {
      "title": "지금 내 포인트부터\n확인해보세요",
      "isCta": true,
      "durationSec": 3.9
    }
  ]
}
```

수정 후 `npm run check`로 검사하고 `npm run render`로 렌더링하면 됩니다.
필드별 규칙은 **[CARD_RULES.md](./CARD_RULES.md)** 에 전부 정리돼 있습니다.

---

## ❓ 자주 막히는 곳

**`npm install`에서 멈춰요**
→ 회사망/방화벽 문제일 수 있습니다. 개인 네트워크에서 다시 시도해보세요.

**렌더링할 때 Chrome 다운로드가 실패해요**
→ Chrome이 이미 깔려 있다면 그 경로를 지정하면 됩니다.
```bash
# Windows PowerShell
$env:REMOTION_BROWSER_EXECUTABLE="C:\Program Files\Google\Chrome\Application\chrome.exe"
npm run render
```

**글자가 네모(□)로 나와요**
→ 폰트가 복사되지 않은 경우입니다. `node scripts/setup-fonts.mjs`를 실행하세요.

**영상이 너무 길어요 / 짧아요**
→ `src/script.json`의 `durationSec` 값을 조절하거나, 카드 장수를 줄이세요.
   클로드코드에게 `"25초로 줄여줘"`라고 말해도 됩니다.
