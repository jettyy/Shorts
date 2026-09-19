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

/** 출처 한 줄 */
const sourceLine = (script) => {
  const src = script.source ?? {};
  const who = [src.publisher, src.title].filter(Boolean).join(' · ');
  const when = src.checkedOn ? ` (${src.checkedOn} 기준)` : '';
  return `자료: ${who || '출처 미기재'}${when}`;
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

  const title = oneLine(hook).slice(0, 60) || topic;
  const lead = clean(hook?.narration) || title;

  const tags = [...topicTags(script), '정보', '꿀팁', '쇼츠'];
  const hashtags = [...new Set([...topicTags(script), '쇼츠', '정보', '꿀팁', '생활정보'])]
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

  const threads = [title, '', ...bodyLines(script).slice(0, 3), '', sourceLine(script)]
    .join('\n')
    .trim()
    .slice(0, 480);

  const facebook = [
    title,
    '',
    ...bodyLines(script).slice(0, 4),
    '',
    conclusion ? clean(conclusion.narration) : '',
    '',
    sourceLine(script),
  ]
    .join('\n')
    .trim();

  return {
    youtube: { title, description, tags },
    instagram: { caption: instagram },
    threads: { text: threads },
    facebook: { text: facebook },
  };
};

/** 대본에 publish 가 있으면 그걸 쓰고, 빠진 항목만 채워 넣는다 */
export const withPublishCopy = (script) => {
  const generated = buildPublishCopy(script);
  const given = script.publish ?? {};
  return {
    youtube: {
      title: given.youtube?.title?.trim() || generated.youtube.title,
      description: given.youtube?.description?.trim() || generated.youtube.description,
      tags: given.youtube?.tags?.length ? given.youtube.tags : generated.youtube.tags,
    },
    instagram: { caption: given.instagram?.caption?.trim() || generated.instagram.caption },
    threads: { text: given.threads?.text?.trim() || generated.threads.text },
    facebook: { text: given.facebook?.text?.trim() || generated.facebook.text },
  };
};
