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

# 카드 구성 (${cardCount}장)
| # | type | 내용 | origin |
|---|---|---|---|
| 1 | hook | 구체적 질문이나 사실 기반 훅 | creator |
| 2 | fact | 원문에서 확인한 핵심 사실 | source |
| 3 | condition | 누가 대상인지, 조건 정리 | creator |
| 4 | example | **직접 계산한 사례** (필수) | creator |
| 5 | fact | 절차·방법 | source |
| 6 | caveat | **원문에 안 나오는 예외·주의점** (필수) | creator |
| ${cardCount} | conclusion | 제작자의 결론 + cta 한 줄 | creator |

- origin이 "creator"인 카드가 3장 이상이어야 한다.
- 1번은 반드시 type "hook", 마지막은 반드시 type "conclusion".
- 훅에 "오늘은 ~에 대해 알아보겠습니다" 같은 도입부를 쓰지 마라. 원문 제목을 베끼지 마라.

# title
- 최대 3줄, 한 줄 15~17자. 줄바꿈은 \\n 으로 직접 지정하고 의미 단위로 끊어라.
- 마침표를 쓰지 마라. 물음표·느낌표는 훅에서만.
- 도표가 있는 카드는 제목이 작게 렌더링되므로, 도표가 무슨 말을 하는지 알려주는 한 줄이면 충분하다.

# narration (모든 카드 필수)
- 제작자가 직접 읽을 구어체 문장. 한두 문장.
- 자막을 그대로 읽지 말고, 화면에 없는 설명을 더해라.

# visual (도표) — 카드마다 붙여라. 글자만 있는 카드는 1장 이하.
항목 수는 어느 도표든 4개 이하. 한 영상 안에서 도표 종류를 섞어라.

- stat: 핵심 숫자 하나
  {"kind":"stat","value":"23,000","unit":"원","caption":"어떻게 나온 숫자인지","delta":{"text":"작년 대비 +12%","dir":"up"}}
- bar: 항목별 크기 비교
  {"kind":"bar","unit":"원","items":[{"label":"A","value":12400,"highlight":true},{"label":"B","value":6850,"note":"보조설명"}]}
- trend: 시간에 따른 변화 (점 4~6개)
  {"kind":"trend","unit":"억","points":[{"label":"2021","value":820},{"label":"2025","value":1180}]}
- donut: 전체 중 비중 (조각 3개 이하)
  {"kind":"donut","centerLabel":"100%","slices":[{"label":"소멸","value":62,"highlight":true},{"label":"전환","value":38}]}
- flow: 관계 도표 / 단계 / 인과관계
  {"kind":"flow","direction":"down","nodes":[{"label":"본인 인증","note":"휴대폰"},{"label":"입금","highlight":true}]}
- calc: 직접 계산한 내역
  {"kind":"calc","lines":[{"label":"A카드","value":"12,400원"}],"result":{"label":"합계","value":"22,370원"}}
- checklist: 해당/비해당
  {"kind":"checklist","items":[{"text":"3년 넘게 쓴 카드가 있다","ok":true},{"text":"작년에 정리했다","ok":false}]}
- table: 2열 비교표 (행 4개 이하)
  {"kind":"table","headers":["A","B"],"highlightCol":1,"rows":[{"label":"기한","a":"5년","b":"1년"}]}
- timeline: 시점별 변화
  {"kind":"timeline","items":[{"when":"지금","label":"조회","highlight":true},{"when":"연말","label":"소멸"}]}

카드 역할별로 잘 맞는 도표: hook→stat / fact→table·flow·trend / condition→checklist /
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
