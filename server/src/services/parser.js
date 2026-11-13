// 결제 알림 문자 / 자연어 문장 → 수입·지출 항목으로 변환
// AI가 우선 해석하고, 키가 없거나 실패하면 정규식 기반 파서로 대체한다.
import { generateJson } from './ai.js';
import { CATEGORIES } from '../constants.js';

const ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'amount', 'date', 'merchant', 'category', 'memo'],
  properties: {
    type: { type: 'string', enum: ['expense', 'income'] },
    amount: { type: 'integer', description: '원 단위 양수 금액' },
    date: { type: 'string', description: 'YYYY-MM-DD, 알 수 없으면 빈 문자열' },
    merchant: { type: 'string', description: '가맹점/상대방 이름, 없으면 빈 문자열' },
    category: { type: 'string', enum: CATEGORIES },
    memo: { type: 'string', description: '목록에 보여줄 짧은 메모 (예: 스타벅스 라떼)' },
  },
};

const PARSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'ignored'],
  properties: {
    items: { type: 'array', items: ITEM_SCHEMA },
    ignored: { type: 'array', items: { type: 'string' }, description: '등록하지 않은 줄과 이유' },
  },
};

const SYSTEM = `당신은 가계부 앱의 입력 도우미입니다.
사용자가 붙여 넣은 카드/은행 결제 알림 문자나 일상 문장에서 수입과 지출 거래를 정확히 뽑아냅니다.
규칙:
- 승인/결제/출금/이체(보냄)는 expense, 입금/급여/환급/받음은 income.
- '승인취소', '취소' 문자는 거래로 넣지 말고 ignored에 이유와 함께 적습니다. 잔액 안내, 광고, 인증번호도 ignored.
- 금액은 원 단위 정수로. '4천원'=4000, '1만 2천원'=12000. 잔액(누적)은 금액이 아닙니다.
- 날짜는 오늘 날짜 기준으로 연도를 채워 YYYY-MM-DD로. 미래 날짜가 되면 작년으로. 날짜가 없으면 빈 문자열.
- 한 문장에 거래가 여러 개면 각각 나눕니다. ("라떼 6500원이랑 김밥 4천원" → 2건)
- category는 가맹점/내용으로 판단합니다. 수입은 '기타'.
- 문자에 있는 이름(예: 홍*동)은 개인정보이므로 memo에 넣지 않습니다.`;

// ---------- 규칙 기반 대체 파서 ----------
const CATEGORY_KEYWORDS = [
  ['카페/간식', ['스타벅스', '커피', '카페', '이디야', '투썸', '메가', '컴포즈', '빽다방', '베이커리', '파리바게뜨', '뚜레쥬르', '배스킨', '디저트', '라떼', '아메리카노']],
  ['식비', ['식당', '김밥', '국밥', '치킨', '피자', '버거', '맥도날드', '롯데리아', '배달의민족', '배민', '요기요', '쿠팡이츠', '분식', '학식', '도시락', '점심', '저녁', '아침', 'gs25', 'cu', '세븐일레븐', '이마트24', '편의점']],
  ['교통', ['택시', '카카오t', '버스', '지하철', '티머니', '코레일', 'srt', '주유', '교통']],
  ['쇼핑', ['쿠팡', '11번가', 'g마켓', '무신사', '올리브영', '다이소', '네이버페이', '스마트스토어', '쇼핑']],
  ['문화/여가', ['cgv', '메가박스', '롯데시네마', '영화', '넷플릭스', '유튜브', '멜론', '노래방', 'pc방', '게임']],
  ['생활', ['통신', 'skt', 'kt', 'lg u+', '관리비', '전기', '가스', '수도', '세탁', '마트', '이마트', '홈플러스']],
  ['의료', ['병원', '의원', '약국', '치과', '한의원']],
];

function guessCategory(text) {
  const t = text.toLowerCase();
  for (const [cat, words] of CATEGORY_KEYWORDS) if (words.some((w) => t.includes(w))) return cat;
  return '기타';
}

/** '6,500원', '4천원', '1만 2천원', '12000원' → 숫자 */
function parseAmount(text) {
  const m = text.match(/(\d[\d,]*)\s*원/);
  if (m) return Number(m[1].replace(/,/g, ''));
  const k = text.match(/(?:(\d+)\s*만)?\s*(?:(\d+)\s*천)?\s*원/);
  if (k && (k[1] || k[2])) return Number(k[1] || 0) * 10000 + Number(k[2] || 0) * 1000;
  return 0;
}

function parseDate(text, today) {
  const m = text.match(/(\d{1,2})[/.-](\d{1,2})(?!\d)/);
  if (!m) return '';
  let year = Number(today.slice(0, 4));
  const mm = String(m[1]).padStart(2, '0');
  const dd = String(m[2]).padStart(2, '0');
  if (`${year}-${mm}-${dd}` > today) year -= 1;
  return `${year}-${mm}-${dd}`;
}

/**
 * 붙여 넣은 내용을 거래 단위로 묶는다.
 * - '['로 시작하는 줄은 새 문자 시작 ([Web발신], [신한카드] 등)
 * - 여러 줄 문자: 금액이 아직 없는 문자에 이어지는 줄은 같은 문자로 합침
 * - 이미 금액이 있는 묶음 뒤에 또 금액이 있는 줄이 오면 새 거래 (문자 뒤에 적은 일반 문장 등)
 */
function splitChunks(text) {
  const chunks = [];
  const hasAmount = (s) => parseAmount(s.replace(/(누적|잔액)\s*[\d,]+\s*원?/g, '')) > 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const last = chunks[chunks.length - 1];
    const startsNew =
      line.startsWith('[') ||
      !last ||
      (hasAmount(line) && hasAmount(last) && !/^(누적|잔액)/.test(line));
    if (startsNew) chunks.push(line);
    else chunks[chunks.length - 1] = `${last} ${line}`;
  }
  return chunks;
}

function ruleParse(text, today) {
  const items = [];
  const ignored = [];

  for (const chunk of splitChunks(text)) {
    if (/취소/.test(chunk)) {
      ignored.push(`${chunk.slice(0, 30)} → 취소 문자`);
      continue;
    }
    const amount = parseAmount(chunk.replace(/잔액\s*[\d,]+\s*원?/g, ''));
    if (!amount) {
      ignored.push(`${chunk.slice(0, 30)} → 금액을 찾지 못함`);
      continue;
    }
    const isIncome = /입금|급여|월급|환급|받음|용돈|알바비/.test(chunk);
    // 가맹점: 시각(14:22) 뒤에 오는 글자, 없으면 금액을 뺀 나머지
    const afterTime = chunk.match(/\d{1,2}:\d{2}\s+(.+?)(?:\s+(?:누적|잔액).*)?$/);
    const merchant = (afterTime?.[1] || '')
      .replace(/\d[\d,]*\s*원.*/, '')
      .trim();
    const memo =
      merchant ||
      chunk
        .replace(/\[.*?\]/g, '')
        // 금액 표현 제거: 6,500원 / 4천원 / 1만 2천원 (숫자 없는 '원'은 '병원' 같은 단어라 유지)
        .replace(/(?:\d+\s*만(?:\s*\d+\s*천)?|\d+\s*천|\d[\d,]*)\s*원(?:\([^)]*\))?/g, '')
        .replace(/\d{1,2}[/.-]\d{1,2}|\d{1,2}:\d{2}/g, '')
        .replace(/승인|일시불|체크|사용|결제|입금|출금|[가-힣]\*[가-힣]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 30);
    items.push({
      type: isIncome ? 'income' : 'expense',
      amount,
      date: parseDate(chunk, today),
      merchant,
      category: isIncome ? '기타' : guessCategory(chunk),
      memo: memo || (isIncome ? '수입' : '지출'),
    });
  }
  return { items, ignored };
}

/** @returns {{ items, ignored, provider }} */
export async function parseTransactions(text, today) {
  const user = `오늘 날짜: ${today}
다음 내용에서 거래를 추출해 주세요.
"""
${text}
"""`;
  const result = await generateJson({ system: SYSTEM, user, schema: PARSE_SCHEMA, name: 'parse_transactions' });
  if (result) return { ...result.data, provider: result.provider };
  return { ...ruleParse(text, today), provider: 'rule' };
}

// ---------- 영수증 사진 (멀티모달) ----------
const RECEIPT_SYSTEM = `당신은 가계부 앱의 영수증 인식 도우미입니다. 영수증 사진을 읽고 지출을 추출합니다.
규칙:
- 기본적으로 영수증 한 장 = 지출 1건. amount는 할인까지 반영한 최종 결제 금액(받을금액/결제금액/합계).
- memo는 '가게명 · 대표 품목 외 N개' 형식으로 짧게 (예: 'GS25 · 삼각김밥 외 2개').
- merchant는 가게명, category는 가게/품목으로 판단.
- 날짜는 영수증에 찍힌 날짜(YYYY-MM-DD), 안 보이면 빈 문자열. 연도가 없으면 오늘 기준으로 채움.
- 영수증이 아니거나 금액을 읽을 수 없으면 items는 비우고 ignored에 이유를 적습니다.
- 카드번호, 승인번호, 사업자번호 등은 memo에 넣지 않습니다.`;

/**
 * @param image { mimeType, data(base64) }
 * @returns {{ items, ignored, provider } | null} AI 키가 없으면 null (이미지는 규칙 기반으로 읽을 수 없음)
 */
export async function parseReceipt(image, today) {
  const result = await generateJson({
    system: RECEIPT_SYSTEM,
    user: `오늘 날짜: ${today}\n이 영수증에서 지출을 추출해 주세요.`,
    schema: PARSE_SCHEMA,
    name: 'parse_receipt',
    images: [image],
  });
  return result ? { ...result.data, provider: result.provider } : null;
}

export { ruleParse };
