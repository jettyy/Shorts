/**
 * 제목에서 **눈이 먼저 가야 할 조각**을 찾아낸다.
 *
 * 쇼츠에서 시청자가 한 카드에 쓰는 시간은 2~4초다. 그 안에 문장을 다 읽지 않는다.
 * 숫자·순위·퍼센트만 보고 "볼 만한가"를 판단하고 넘긴다.
 * 그래서 문장을 통째로 같은 크기로 그리면 아무것도 안 읽힌 채 지나간다.
 *
 * 여기서는 글자를 토큰으로 쪼개고, 숫자가 걸린 덩어리만 `emphasis: true` 로 표시한다.
 * 실제로 키우고 색을 입히는 건 `Card.tsx` 가 한다.
 *
 * ⚠️ 한국어는 띄어쓰기로만 끊으면 "1,128만" 과 "원" 이 갈라져서 숫자만 커지고
 *    단위는 작아진다. 보기 흉하고 읽기도 나쁘다. **단위까지 한 덩어리로 묶는다.**
 */

/** 숫자에 붙어서 한 덩어리로 읽히는 단위들 (긴 것부터 — 짧은 게 먼저 걸리면 안 된다) */
const UNITS = [
  '퍼센트',
  '만\\s*원',
  '억\\s*원',
  '조\\s*원',
  '천만',
  '백만',
  '만',
  '억',
  '조',
  '원',
  '위',
  '배',
  '%',
  'p',
  '년',
  '개월',
  '주',
  '일',
  '시간',
  '분',
  '명',
  '건',
  '개',
  '곳',
  '점',
  '위권',
];

/**
 * 숫자로 시작해 단위까지 먹는 덩어리.
 * 예) `1,128만 원` `8.25%` `TOP 5` `1위` `4년`
 */
const NUMERIC = new RegExp(
  `(?:TOP\\s*)?\\d[\\d,.]*\\s*(?:${UNITS.join('|')})?`,
  'iu',
);

/** 숫자가 없어도 강조해야 하는 말 */
const KEYWORDS = ['최대', '최소', '무료', '공짜', '전액', '절반', '두 배', '역대', '꼴찌', '1위'];

export type Token = {
  text: string;
  /** 강조 대상인가 */
  emphasis: boolean;
};

/**
 * 한 줄을 토큰으로 쪼갠다.
 *
 * 공백은 **앞 토큰 뒤에 붙여서** 돌려준다. 그래야 토큰을 inline-block 으로 그려도
 * 단어 사이가 벌어지거나 붙지 않는다.
 */
export const tokenize = (line: string): Token[] => {
  const out: Token[] = [];
  for (const chunk of line.split(/(\s+)/)) {
    if (!chunk) continue;
    if (/^\s+$/.test(chunk)) {
      // 공백은 바로 앞 토큰에 붙인다 (앞이 없으면 버린다)
      if (out.length) out[out.length - 1].text += chunk;
      continue;
    }
    out.push({ text: chunk, emphasis: isEmphatic(chunk) });
  }

  return mergeUnits(out);
};

/**
 * 숫자와 단위가 띄어쓰기로 갈라진 걸 다시 붙인다.
 *
 * 안 붙이면 "1,128만" 은 커지고 "원" 은 작아져서 한 덩어리로 안 읽힌다.
 *  - 뒤로 붙이기: `959만` + `원` → `959만 원` (뒤에 조사가 와도 같이)
 *  - 앞으로 붙이기: `TOP` + `20` → `TOP 20`
 */
const mergeUnits = (tokens: Token[]): Token[] => {
  const merged: Token[] = [];
  for (const t of tokens) {
    const prev = merged[merged.length - 1];
    const bare = t.text.trim();

    // 숫자 덩어리 뒤에 단위(+조사)만 있는 토큰이 오면 흡수한다
    if (prev?.emphasis && UNIT_TAIL.test(bare)) {
      prev.text += t.text;
      continue;
    }
    // "TOP" 뒤에 숫자가 오면 "TOP 20" 으로 함께 강조한다
    if (prev && !prev.emphasis && /^TOP$/i.test(prev.text.trim()) && t.emphasis) {
      prev.text += t.text;
      prev.emphasis = true;
      continue;
    }
    merged.push(t);
  }
  return merged;
};

/** 숫자에 이어 붙는 조사 — 여기까지 한 덩어리로 본다 */
const PARTICLES = '으로|로|은|는|이|가|을|를|과|와|도|만|까지|부터|짜리|대|씩';
const UNIT_TAIL = new RegExp(`^(?:${UNITS.join('|')})(?:${PARTICLES})?[.,!?]?$`, 'iu');

const isEmphatic = (word: string) => {
  const bare = word.replace(/[()[\]"'“”‘’]/g, '');
  if (KEYWORDS.some((k) => bare.includes(k))) return true;
  const m = NUMERIC.exec(bare);
  // 숫자가 단어의 대부분을 차지할 때만 강조한다 (조사만 붙은 경우까지 허용)
  return Boolean(m && m[0].length >= bare.length - 2);
};

/**
 * 한 줄이 온통 숫자면 강조가 아니다 — "1위 2위 3위" 는 셋 다 키워봐야 의미가 없다.
 *
 * ⚠️ 짧은 줄까지 이 규칙에 걸면 안 된다. `959만 원` 은 토큰이 하나뿐이라
 *    "전부 강조"로 보이지만, 그게 바로 그 카드에서 봐야 할 숫자다.
 *    그래서 **세 덩어리 이상**일 때만 따진다.
 */
export const balance = (tokens: Token[]): Token[] => {
  const hits = tokens.filter((t) => t.emphasis).length;
  if (hits < 3 || hits * 2 <= tokens.length) return tokens;
  return tokens.map((t) => ({ ...t, emphasis: false }));
};

/** 화면에 그릴 토큰 목록 */
export const emphasize = (line: string): Token[] => balance(tokenize(line));
