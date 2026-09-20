/**
 * 원문을 카드 대본(script.json)으로 바꾸라는 지시문을 만든다.
 *
 * 이 지시문은 CARD_RULES.md 의 요약판이다.
 * UI에서 "대본 만들기"를 누르면 이 지시문이 Claude Code CLI 로 전달되고,
 * CLI 가 없는 환경에서는 사용자가 복사해서 클로드에 직접 붙여넣는다.
 */
export const buildPrompt = ({ text, source, accent, cardCount = 7 }) => `
너는 "해설형 정보 쇼츠" 대본 작가다. 아래 원문을 읽고 카드 대본 JSON을 만들어라.

# 절대 규칙
- **원문 문장을 그대로 옮기지 마라.** 사실과 숫자만 가져와 처음부터 다시 써라.
- **원문에 없는 수치나 사실을 지어내지 마라.** 원문이 애매하면 애매한 채로 줄여라.
- 출력은 **JSON 하나만**. 설명, 인사말, 마크다운 코드펜스 바깥의 어떤 텍스트도 쓰지 마라.

# 0단계 — 원문에서 "핵심이 무엇인가"부터 정해라 (가장 중요)

카드를 쓰기 전에 먼저 판단해라. **원문의 핵심이 목록·순위·표 그 자체인 경우가 있다.**
그럴 때 상위 몇 개만 뽑고 나머지를 설명으로 때우면 영상이 죽는다.
"TOP 20"이 원문이면 시청자가 보러 온 것은 **20개 전부**다.

- 목록·순위가 핵심이면 → **전부 실어라.** 한 카드에 안 들어가면 카드를 나눠서 이어 보여준다.
- 설명·제도가 핵심이면 → 숫자와 조건을 도표로 정리한다.
- **원문에 있는 핵심 수치를 빠뜨리지 마라.** 줄여야 한다면 설명을 줄이고 데이터를 남겨라.

# 1단계 — 구성(format)을 골라라

주제마다 똑같은 뼈대를 쓰면 영상이 전부 비슷해지고 지루해진다.
아래 다섯 중 원문에 맞는 것을 **하나 고르고**, 그 구성대로 ${cardCount}장을 짜라.

**A. ranking — 순위·TOP N·랭킹·"가장 ~한 곳"**
| # | type | 내용 |
|---|---|---|
| 1 | hook | 1위를 바로 까지 말고 궁금하게. stat 으로 "1위 값"만 크게 던지거나, 범위를 보여준다 |
| 2~4 | fact | **ranklist 로 순위를 나눠서 전부** (한 장에 최대 14행, 보통 7~10행이 보기 좋다) |
| 5 | example | 그 숫자를 내 상황으로 환산한 **직접 계산** (월 실수령, 내 연봉과의 차이 등) |
| 6 | caveat | 이 순위를 그대로 믿으면 안 되는 이유 (평균의 함정, 집계 기준, 표본) |
| ${cardCount} | conclusion | 결론 + cta |

**B. explainer — 제도·혜택·지원금 설명** (기본형)
1 hook(stat) → 2 fact(핵심 사실) → 3 condition(checklist 대상 조건) →
4 example(calc 직접 계산) → 5 fact(flow 절차) → 6 caveat → ${cardCount} conclusion

**C. howto — 신청 방법·절차가 핵심**
1 hook → 2 condition(체크리스트) → 3~5 fact(flow/timeline 으로 단계) →
example 1장 + caveat 1장 반드시 포함 → ${cardCount} conclusion

**D. compare — A vs B 중 뭘 고를까**
1 hook → 2~3 fact(table 비교표, 행을 아끼지 말고 실제로 다른 항목을 다 넣어라) →
4 example(내 조건에 넣어 계산) → 5 caveat → ${cardCount} conclusion

**E. change — 변화·추이·전망**
1 hook(stat) → 2~3 fact(trend/bar) → 4 example → 5 caveat(전망의 한계) → ${cardCount} conclusion

## 어떤 구성이든 지켜야 하는 것
- 1번은 반드시 type "hook", 마지막은 반드시 type "conclusion".
- **example(직접 계산) 1장과 caveat(주의점) 1장은 어떤 구성에서도 반드시 들어간다.**
- origin이 "creator"인 카드가 3장 이상이어야 한다.
- 훅에 "오늘은 ~에 대해 알아보겠습니다" 같은 도입부를 쓰지 마라. 원문 제목을 베끼지 마라.
- 카드 수가 부족해서 데이터가 잘린다면 ${cardCount}장을 넘겨도 된다. **데이터가 우선이다.**

# title
- 최대 3줄, 한 줄 15~17자. 줄바꿈은 \\n 으로 직접 지정하고 의미 단위로 끊어라.
- 마침표를 쓰지 마라. 물음표·느낌표는 훅에서만.
- 도표가 있는 카드는 제목이 작게 렌더링되므로, 도표가 무슨 말을 하는지 알려주는 한 줄이면 충분하다.

# narration (모든 카드 필수)
- 제작자가 직접 읽을 구어체 문장. 한두 문장.
- 자막을 그대로 읽지 말고, 화면에 없는 설명을 더해라.

# visual (도표) — 카드마다 붙여라. 글자만 있는 카드는 1장 이하.

**항목 수 제한은 없다.** 도표는 항목 수에 맞춰 글자·행 높이가 자동으로 줄어든다.
다만 한 카드에 읽을 수 있는 한계가 있으니, 넘치면 **줄이지 말고 카드를 나눠라.**

| 도표 | 한 카드 최대 | 보기 좋은 수 |
|---|---|---|
| ranklist | 14행 | 7~10행 |
| bar | 8개 | 3~5개 |
| checklist | 10개 | 3~5개 |
| table | 10행 | 3~5행 |
| calc | 12줄 | 3~6줄 |
| timeline | 8개 | 3~5개 |
| flow(세로) | 7개 | 3~4개 |
| donut | 4조각 | 2~3조각 |
| trend | 8점 | 4~6점 |

글자가 길어 두 줄로 접히는 항목(체크리스트·비교표·타임라인)은 위 최대의 절반쯤으로 잡아라.

한 영상 안에서 도표 종류를 섞어라. 같은 종류가 연달아 3장 나오면 지루하다
(단, ranklist 로 순위를 이어 보여주는 것은 예외 — 그게 콘텐츠다).

- ranklist: **순위 목록 / TOP N / 랭킹.** 순위 원문이면 이걸 써서 전부 보여줘라.
  value 는 화면에 찍힐 문자열 그대로, barValue 는 막대 길이용 숫자(선택).
  나눠 실을 땐 rank 를 직접 지정하고, totalRanks 에 전체 개수를 넣어라.
  highlight 는 한 카드에 하나만 (없어도 된다).
  **끝까지 보게 하려면 낮은 순위부터 거꾸로 올라가는 구성도 좋다**
  (20~14위 → 13~7위 → 6~1위). 그러면 1위가 마지막에 나온다.
  {"kind":"ranklist","totalRanks":20,"items":[
    {"rank":1,"label":"한국수력원자력","value":"1억 847만 원","barValue":10847,"highlight":true},
    {"rank":2,"label":"한국가스공사","value":"1억 609만 원","barValue":10609}]}
- stat: 핵심 숫자 하나
  {"kind":"stat","value":"23,000","unit":"원","caption":"어떻게 나온 숫자인지","delta":{"text":"작년 대비 +12%","dir":"up"}}
- bar: 항목별 크기 비교
  {"kind":"bar","unit":"원","items":[{"label":"A","value":12400,"highlight":true},{"label":"B","value":6850,"note":"보조설명"}]}
- trend: 시간에 따른 변화
  {"kind":"trend","unit":"억","points":[{"label":"2021","value":820},{"label":"2025","value":1180}]}
- donut: 전체 중 비중
  {"kind":"donut","centerLabel":"100%","slices":[{"label":"소멸","value":62,"highlight":true},{"label":"전환","value":38}]}
- flow: 관계 도표 / 단계 / 인과관계
  {"kind":"flow","direction":"down","nodes":[{"label":"본인 인증","note":"휴대폰"},{"label":"입금","highlight":true}]}
- calc: 직접 계산한 내역
  {"kind":"calc","lines":[{"label":"A카드","value":"12,400원"}],"result":{"label":"합계","value":"22,370원"}}
- checklist: 해당/비해당
  {"kind":"checklist","items":[{"text":"3년 넘게 쓴 카드가 있다","ok":true},{"text":"작년에 정리했다","ok":false}]}
- table: 2열 비교표
  {"kind":"table","headers":["A","B"],"highlightCol":1,"rows":[{"label":"기한","a":"5년","b":"1년"}]}
- timeline: 시점별 변화
  {"kind":"timeline","items":[{"when":"지금","label":"조회","highlight":true},{"when":"연말","label":"소멸"}]}

카드 역할별로 잘 맞는 도표: hook→stat / fact→ranklist·table·flow·trend / condition→checklist /
example→calc·bar / caveat→checklist(ok:false 위주) / conclusion→timeline·stat

# durationSec
narration 공백 제외 글자 수 ÷ 5.2 + 0.7, 최소 2.5. 소수점 첫째 자리.

# publish — 업로드용 문구 (반드시 포함)
영상과 함께 각 플랫폼에 올릴 문구를 같이 만들어라.
- youtube.title: 60자 이내. 검색될 만한 핵심어를 앞에 두되 낚시성 과장은 쓰지 마라.
- youtube.description: 3~5줄. 첫 줄은 영상 핵심 한 문장, 그 다음 카드 내용 요약,
  마지막에 출처(매체·제목). #쇼츠 같은 태그 2~3개를 맨 끝에.
- youtube.tags: 5~8개 문자열 배열. # 없이 단어만.
- instagram.caption: 첫 줄이 훅. 3~4줄. 끝에 **해시태그를 정확히 5개만** 줄바꿈 후 한 줄로.
  (5개보다 많아도 적어도 안 된다)
- threads.text: **말투가 다르다. 반말로, 친구한테 알려주듯 친근하게 써라.**
  · 공백 포함 180~210자
  · 첫 줄은 궁금하게 만드는 한 줄 (끝에 이모지 하나)
  · "~더라", "~했거든", "~해봐" 같은 구어체를 쓴다. 존댓말과 섞지 마라
  · 자기 경험처럼 자연스럽게 ("나도 해봤는데", "찾아보니까")
  · 마지막은 댓글·저장 유도 한 줄 (이모지 하나)
  · 이모지는 전체 2개 정도만. 남발하지 마라
  · 쓰레드는 해시태그를 하나만 지원한다. 주제 태그 1개만 맨 끝에 붙이거나 생략해라
  예시 톤: "이거 모르는 사람 은근 많더라 👀 나도 어제 찾아보고 알았는데 …
  3분이면 되니까 오늘 한 번 해봐! 궁금한 거 있으면 댓글 달아줘 🙌"
모든 문구에 원문 문장을 그대로 옮기지 마라.
**업로드 문구에는 확인 기준일(날짜)을 넣지 마라.** 세 플랫폼 문구 모두 해당한다.
영상 마지막 카드에 이미 나오고, 문구에 날짜가 박히면 다시 올릴 때 고쳐야 한다.

# 출력 형식 (이 구조 그대로)
{
  "topic": "파일명에 쓸 짧은 주제 (10자 이내)",
  "publish": {
    "youtube": { "title": "...", "description": "...", "tags": ["...", "..."] },
    "instagram": { "caption": "..." },
    "threads": { "text": "..." }
  },
  "accent": "${accent}",
  "source": ${JSON.stringify(source)},
  "cards": [
    {
      "type": "hook",
      "origin": "creator",
      "kicker": "상단 라벨 8자 이내 (선택)",
      "title": "제목\\n두 번째 줄",
      "body": "보조 설명 한 줄 (선택)",
      "narration": "직접 읽을 문장",
      "durationSec": 6.1,
      "visual": { "kind": "stat", "value": "...", "unit": "..." }
    }
  ]
}
마지막 카드에만 "cta": "짧은 행동 유도 한 줄" 을 넣어라.

# 원문
---
${text}
---

JSON만 출력하라.
`.trim();
