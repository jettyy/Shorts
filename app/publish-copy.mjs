/**
 * 업로드용 문구(제목·설명·해시태그) 만들기.
 *
 * 대본을 만들 때 claude 가 publish 블록을 같이 써주지만,
 * 예전에 만든 대본이나 수동으로 넣은 대본에는 없을 수 있다.
 * 그럴 때 대본 내용만으로 그럴듯한 문구를 즉석에서 만들어낸다.
 * (추가 API 호출 없이 즉시 만들어진다)
 */

const clean = (s) => String(s ?? '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

/** 제목에 어울리게 카드 제목을 한 줄로 */
const oneLine = (card) => clean(card?.title);

/**
 * 출처 한 줄.
 * 확인 기준일은 넣지 않는다 — 영상 마지막 카드에 이미 나오고,
 * 업로드 문구에 날짜가 박히면 나중에 다시 올릴 때 문구를 고쳐야 한다.
 */
const sourceLine = (script) => {
  const src = script.source ?? {};
  const who = [src.publisher, src.title].filter(Boolean).join(' · ');
  return `자료: ${who || '출처 미기재'}`;
};

/** 주제에서 해시태그 후보를 뽑는다 */
const topicTags = (script) => {
  const words = clean(script.topic)
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 3);
  return [...new Set(words)];
};

const bodyLines = (script) =>
  (script.cards ?? [])
    .filter((c) => c.type !== 'hook' && c.type !== 'conclusion')
    .slice(0, 4)
    .map((c) => `· ${oneLine(c)}`);

export const buildPublishCopy = (script) => {
  const cards = script.cards ?? [];
  const hook = cards.find((c) => c.type === 'hook') ?? cards[0];
  const conclusion = cards[cards.length - 1];
  const topic = clean(script.topic) || oneLine(hook);

  /**
   * 제목은 "주제 + 후킹 문장" 이 가장 잘 눌린다.
   * 1번 카드의 headline 이 곧 주제(예: "공기업 평균연봉 TOP 16")라서 앞에 세운다.
   * headline 이 없는 옛 대본은 예전처럼 훅 제목만 쓴다.
   */
  const banner = clean(hook?.headline);
  const hookLine = oneLine(hook);
  const title = (banner && hookLine ? `${banner} | ${hookLine}` : banner || hookLine).slice(0, 60)
    || topic;
  const lead = clean(hook?.narration) || title;

  const tags = [...topicTags(script), '정보', '꿀팁', '쇼츠'];

  // 인스타 해시태그는 딱 5개. 주제에서 뽑은 걸 앞에 두고 모자라면 기본 태그로 채운다.
  const hashtags = [...new Set([...topicTags(script), '생활정보', '꿀팁', '정보', '쇼츠'])]
    .slice(0, 5)
    .map((t) => `#${t.replace(/\s/g, '')}`)
    .join(' ');

  const description = [
    lead,
    '',
    ...bodyLines(script),
    '',
    conclusion ? clean(conclusion.narration) : '',
    '',
    sourceLine(script),
    '',
    hashtags,
  ]
    .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
    .join('\n')
    .trim();

  const instagram = [
    title,
    '',
    ...bodyLines(script).slice(0, 3),
    '',
    sourceLine(script),
    '',
    hashtags,
  ]
    .join('\n')
    .trim();

  /**
   * 쓰레드는 말투가 다르다.
   * 정보를 또박또박 나열하는 것보다, 친구한테 알려주듯 반말로 던지는 글이 잘 읽힌다.
   * 200자 안팎, 이모지 한두 개, 댓글 유도로 마무리한다.
   * (쓰레드는 해시태그를 한 개만 지원해서 주제 태그 하나만 붙인다)
   */
  const threadTag = topicTags(script)[0];
  const threads = [
    `${title.replace(/[.!?]$/, '')} 👀`,
    '',
    '이거 모르는 사람 생각보다 많더라.',
    '조건이랑 확인하는 방법까지 영상에 담아놨어.',
    '나도 해보니까 몇 분 안 걸리더라고!',
    '',
    '궁금한 거 있으면 댓글 달아줘 🙌',
    threadTag ? `#${threadTag.replace(/\s/g, '')}` : '',
  ]
    .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
    .join('\n')
    .trim();

  return {
    youtube: { title, description, tags },
    instagram: { caption: instagram },
    threads: { text: threads },
  };
};

/** 2026-09-20 / 2026. 09. 20. / 2026년 9월 20일 */
const DATE = '\\d{4}\\s*[-./년]\\s*\\d{1,2}\\s*[-./월]\\s*\\d{1,2}\\s*일?\\.?';

/**
 * 업로드 문구에서 확인 기준일을 걷어낸다.
 *
 * 문구는 대본의 `publish` 블록을 그대로 쓰는데, 예전에 만든 대본에는
 * "확인 기준일 2026년 9월 20일" 같은 문장이 박혀 있다.
 * 날짜는 영상 마지막 카드에만 두고 문구에는 남기지 않는다.
 */
const stripCheckedOn = (text) =>
  String(text ?? '')
    // "/ 2026-09-20 기준", "(2026-09-20 기준)"
    .replace(new RegExp(`\\s*[(\\[]?\\s*[/·]?\\s*${DATE}\\s*기준\\s*[)\\]]?`, 'g'), '')
    // "확인 기준일: 2026-09-20", "· 확인 기준일 2026년 9월 20일"
    .replace(new RegExp(`\\s*[/·|,]?\\s*확인\\s*기준일\\s*[:：]?\\s*(${DATE})?`, 'g'), '')
    // 날짜를 들어낸 자리에 남은 빈 괄호·구분자·빈 줄 정리
    .replace(/\s*[([{][\s·/|,]*[)\]}]/g, '')
    .split('\n')
    .map((line) => line.replace(/\s*[/·|,]\s*$/, '').trimEnd())
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n')
    .trim();

/** 대본에 publish 가 있으면 그걸 쓰고, 빠진 항목만 채워 넣는다 */
export const withPublishCopy = (script) => {
  const generated = buildPublishCopy(script);
  const given = script.publish ?? {};
  const pick = (a, b) => stripCheckedOn(String(a ?? '').trim() || b);
  return {
    youtube: {
      title: pick(given.youtube?.title, generated.youtube.title),
      description: pick(given.youtube?.description, generated.youtube.description),
      tags: given.youtube?.tags?.length ? given.youtube.tags : generated.youtube.tags,
    },
    instagram: { caption: pick(given.instagram?.caption, generated.instagram.caption) },
    threads: { text: pick(given.threads?.text, generated.threads.text) },
  };
};
