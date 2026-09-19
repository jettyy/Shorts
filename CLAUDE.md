# 이 저장소에서 작업할 때 (클로드코드용 지침)

## 이 프로젝트가 하는 일

기사·블로그 원문을 카드뉴스형 세로 쇼츠(1080×1920 mp4)로 만드는 Remotion 프로젝트다.

## 가장 중요한 규칙

**원문 → 카드 대본 변환은 API를 호출하지 않는다. 클로드코드가 직접 한다.**

- 이 저장소에 Anthropic API 호출 코드, API 키, `.env`, `dotenv`를 **추가하지 않는다.**
- 사용자가 원문을 붙여넣으며 "쇼츠 만들어줘"라고 하면, 그 세션의 클로드코드가
  원문을 직접 읽고 분석해 `src/script.json`을 작성한 뒤 렌더 명령까지 실행한다.

## 원문을 받았을 때 할 일

1. **[CARD_RULES.md](./CARD_RULES.md)를 먼저 읽는다.** 대본 작성 기준이 전부 거기 있다.
2. 규칙대로 `src/script.json`을 덮어쓴다 (6~8장, 1번=훅, 마지막=CTA).
3. `npm run check` — 규칙 위반이 있으면 고친다.
4. `npm run render` — `output/카드뉴스_[주제]_[타임스탬프].mp4` 생성.
5. 결과 파일 경로와 총 길이를 사용자에게 알려준다.

## 건드리지 말 것

- `src/components/` 의 디자인은 **재사용 템플릿**이다. 새 주제를 만들 때는 손대지 않는다.
- 톤 변경 요청이 명시적으로 들어왔을 때만 `src/theme.ts`의 토큰을 수정한다.

## 환경 메모

- 렌더링에는 Chrome/Chromium이 필요하다. 자동 다운로드가 막힌 환경에서는
  `scripts/find-browser.mjs`가 설치된 브라우저를 찾아 쓴다.
  직접 지정하려면 `REMOTION_BROWSER_EXECUTABLE` 환경변수를 쓴다.
- 한글 폰트(Pretendard)는 `npm install` 시 `scripts/setup-fonts.mjs`가
  `node_modules`에서 `public/fonts/`로 복사한다. 외부 CDN을 쓰지 않는다.
