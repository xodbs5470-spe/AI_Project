// AI 코칭: 계산된 숫자를 AI에 넘겨 해석/조언만 받는다.
// API 키가 없거나 호출이 실패하면 규칙 기반 메시지로 대체해 앱이 항상 동작하게 한다.
import { generateJson } from './ai.js';

const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;

const SYSTEM = `당신은 '저금이돈' 앱의 친근한 절약 코치입니다.
- 사용자가 저축 목표를 달성하도록 구체적이고 실천 가능한 조언을 합니다.
- 반드시 주어진 숫자만 사용하고, 금액을 새로 계산하거나 지어내지 않습니다.
- 한국어로, 짧고 다정하지만 솔직하게 말합니다. 비난하지 않습니다.`;

const strArray = { type: 'array', items: { type: 'string' } };

// ---------- 1. 하루 소비 분석 ----------
const DAILY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'summary', 'good_points', 'waste', 'tips'],
  properties: {
    score: { type: 'integer', description: '0~100 소비 평점' },
    summary: { type: 'string', description: '한두 문장 총평' },
    good_points: strArray,
    waste: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['item', 'reason'],
        properties: { item: { type: 'string' }, reason: { type: 'string' } },
      },
    },
    tips: strArray,
  },
};

function ruleDailyReport({ dailyLimit, expenses }) {
  // 돌발 지출은 리밸런싱으로 처리하므로 평점에서 제외
  const spent = expenses.filter((e) => !e.is_unexpected).reduce((a, e) => a + e.amount, 0);
  const ratio = dailyLimit > 0 ? spent / dailyLimit : spent > 0 ? 2 : 0;
  const score = Math.max(0, Math.min(100, Math.round(100 - Math.max(0, ratio - 0.7) * 100)));
  const cafe = expenses.filter((e) => e.category === '카페/간식');
  return {
    score,
    summary:
      spent <= dailyLimit
        ? `한도 ${won(dailyLimit)} 중 ${won(spent)}을 썼어요. 잘 지켰어요!`
        : `한도보다 ${won(spent - dailyLimit)} 더 썼어요. 내일 한도가 조금 줄어들어요.`,
    good_points: spent <= dailyLimit ? ['일일 한도를 지켰어요'] : [],
    waste: cafe.length >= 2 ? [{ item: '카페/간식', reason: `하루 ${cafe.length}회 지출` }] : [],
    tips: ['지출은 그때그때 기록하면 충동 소비를 줄일 수 있어요'],
  };
}

export async function analyzeDay({ goal, date, dailyLimit, expenses }) {
  const user = `다음 하루 지출을 평가해 주세요.
평점 기준: 한도 이내이고 필수 지출 위주면 높게, 한도 초과나 반복적인 충동성 지출(카페, 배달, 쇼핑 등)은 낮게.
'돌발지출: true'인 항목(병원비 등 피할 수 없던 지출)은 이미 남은 기간 예산에 재분배되었으므로 평점에서 제외하고 낭비로 지적하지 마세요.
waste에는 줄일 수 있었던 지출만, tips에는 내일 바로 실천할 행동 2~3개를 적어 주세요.

${JSON.stringify(
  {
    목표: goal.title,
    목표금액: goal.target_amount,
    날짜: date,
    일일한도: dailyLimit,
    총지출: expenses.reduce((a, e) => a + e.amount, 0),
    지출내역: expenses.map((e) => ({
      금액: e.amount,
      카테고리: e.category,
      메모: e.memo,
      돌발지출: e.is_unexpected,
    })),
  },
  null,
  2,
)}`;

  const result = await generateJson({ system: SYSTEM, user, schema: DAILY_SCHEMA, name: 'daily_report' });
  if (!result) return { data: ruleDailyReport({ dailyLimit, expenses }), provider: 'rule' };
  result.data.score = Math.max(0, Math.min(100, Math.round(result.data.score)));
  return result;
}

// ---------- 2. 오늘의 점심/지출 가이드 ----------
const LUNCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['message', 'menus'],
  properties: {
    message: { type: 'string' },
    menus: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'price', 'place', 'reason'],
        properties: {
          name: { type: 'string', description: '메뉴 이름' },
          price: { type: 'integer', description: '한국 평균 기준 예상 가격(원)' },
          place: { type: 'string', description: '식당, 편의점, 학식, 도시락 등' },
          reason: { type: 'string', description: '추천 이유 한 줄' },
        },
      },
    },
  },
};

// AI가 없을 때 쓰는 메뉴표 (한국 평균 가격 기준 대략값)
const MENU_TABLE = [
  { name: '집에서 싸 온 도시락', price: 0, place: '도시락', reason: '가장 확실한 절약' },
  { name: '삼각김밥 + 컵라면', price: 3500, place: '편의점', reason: '최소 비용으로 든든하게' },
  { name: '학식 정식', price: 5000, place: '학식', reason: '가격 대비 영양 균형' },
  { name: '편의점 도시락', price: 5500, place: '편의점', reason: '반찬 구성이 다양해요' },
  { name: '김밥 + 라면', price: 7000, place: '분식집', reason: '빠르고 저렴한 한 끼' },
  { name: '짜장면', price: 7500, place: '중식당', reason: '예산 안에서 무난한 선택' },
  { name: '떡볶이 + 순대', price: 8000, place: '분식집', reason: '둘이 나눠 먹으면 더 아껴요' },
  { name: '순두부찌개', price: 9000, place: '한식당', reason: '따뜻하고 든든해요' },
  { name: '비빔밥', price: 9000, place: '한식당', reason: '채소까지 한 번에' },
  { name: '제육볶음 정식', price: 9500, place: '한식당', reason: '든든한 고기 한 끼' },
  { name: '국밥', price: 10000, place: '국밥집', reason: '양이 많아 저녁까지 버텨요' },
  { name: '돈까스', price: 11000, place: '경양식', reason: '예산을 꽉 채운 만족감' },
  { name: '쌀국수', price: 12000, place: '아시안', reason: '가볍지만 배부르게' },
  { name: '냉면', price: 12000, place: '한식당', reason: '시원한 한 끼' },
  { name: '수제버거 세트', price: 13000, place: '버거집', reason: '여유 있는 날의 보상' },
  { name: '초밥 정식', price: 15000, place: '일식당', reason: '예산이 넉넉한 날에' },
];

/** 예산 안의 메뉴 4개: 예산에 가까운 것 위주 + 가장 아끼는 선택 1개 */
function ruleMenus(lunchBudget) {
  const fit = MENU_TABLE.filter((m) => m.price <= lunchBudget);
  const top = fit.slice(-3).reverse();
  const cheapest = fit.find((m) => m.price > 0 && !top.includes(m));
  return [...top, ...(cheapest ? [cheapest] : [])];
}

export async function lunchTip({ goal, budget }) {
  const lunchBudget = budget.lunchBudget;
  const user = `오늘 점심 예산은 ${won(lunchBudget)}입니다.
1) message: 오늘 지출 가이드를 2문장 이내로.
2) menus: 이 예산 이하로 먹을 수 있는 점심 메뉴 4개. 한국 평균 가격을 기준으로 현실적인 예상 가격(price)을 쓰고,
   예산을 넘는 메뉴는 절대 넣지 마세요. 식당/분식/편의점/학식 등 장소를 다양하게, 예산에 가까운 메뉴부터.

${JSON.stringify(
  {
    목표: goal.title,
    점심예산: lunchBudget,
    오늘일일한도: budget.dailyLimit,
    오늘이미쓴돈: budget.spentToday,
    남은일수: budget.remainingDays,
    목표달성가능: budget.onTrack,
  },
  null,
  2,
)}`;

  const result = await generateJson({ system: SYSTEM, user, schema: LUNCH_SCHEMA, name: 'lunch_tip' });
  if (result) {
    // AI가 예산을 넘는 메뉴를 내면 걸러내고, 부족하면 메뉴표로 채운다
    const menus = result.data.menus.filter((m) => m.price >= 0 && m.price <= lunchBudget);
    for (const m of ruleMenus(lunchBudget)) {
      if (menus.length >= 4) break;
      if (!menus.some((x) => x.name === m.name)) menus.push(m);
    }
    result.data.menus = menus.slice(0, 4);
    return result;
  }

  return {
    provider: 'rule',
    data: {
      message:
        lunchBudget > 0
          ? `오늘은 ${won(budget.dailyLimit)}까지 쓸 수 있어요. 점심은 ${won(lunchBudget)} 안에서 골라 보세요.`
          : '오늘은 쓸 수 있는 예산이 없어요. 집밥이나 도시락으로 버텨 봐요!',
      menus: ruleMenus(lunchBudget),
    },
  };
}

// ---------- 3. 돌발 지출 리밸런싱 조언 ----------
const REBALANCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['message', 'actions'],
  properties: { message: { type: 'string' }, actions: strArray },
};

export async function rebalanceAdvice({ goal, expense, plan }) {
  const user = `예상치 못한 지출이 생겨 남은 기간 예산을 다시 나눴습니다.
사용자를 안심시키는 한두 문장과, 남은 기간 동안 줄일 수 있는 구체적 행동 2~3개를 주세요.

${JSON.stringify(
  {
    목표: goal.title,
    돌발지출: { 금액: expense.amount, 카테고리: expense.category, 메모: expense.memo },
    남은일수: plan.daysLeft,
    조정전일일한도: plan.before,
    조정후일일한도: plan.after,
    하루당감소액: plan.diffPerDay,
    남은가용예산: plan.remainingBudget,
  },
  null,
  2,
)}`;

  const result = await generateJson({ system: SYSTEM, user, schema: REBALANCE_SCHEMA, name: 'rebalance' });
  if (result) return result;
  return {
    provider: 'rule',
    data: {
      message:
        plan.daysLeft > 0
          ? `괜찮아요! 남은 ${plan.daysLeft}일 동안 하루 한도를 ${won(plan.before)}에서 ${won(plan.after)}으로 조정하면 돼요.`
          : '목표 기간의 마지막 날이라 남은 기간에 나눌 수 없어요.',
      actions: ['배달 대신 포장이나 집밥', '카페는 하루 1회 이하로', '구독 서비스 점검하기'],
    },
  };
}

// ---------- 4. "이거 사도 될까?" 구매 판단 ----------
const PURCHASE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'headline', 'reasons', 'alternatives', 'wait_days'],
  properties: {
    verdict: { type: 'string', enum: ['buy', 'wait', 'skip'], description: 'buy=사도 됨, wait=미루기, skip=사지 않기' },
    headline: { type: 'string', description: '한 줄 결론' },
    reasons: { ...strArray, description: '판단 근거 2~3개 (계산 결과 숫자 인용)' },
    alternatives: { ...strArray, description: '더 저렴한 대안이나 아끼는 방법 1~3개' },
    wait_days: { type: 'integer', description: 'wait일 때 추천 대기 일수, 아니면 0' },
  },
};

function rulePurchase(sim, dailyLimit) {
  if (!sim.affordable)
    return {
      verdict: 'skip',
      headline: `지금 사면 목표 금액에서 ${won(sim.shortfall)}이 모자라요.`,
      reasons: [`구매 후 남는 가용 예산이 ${won(sim.remainingAfter)}이에요.`],
      alternatives: ['중고나 할인 상품을 찾아보기', '목표 기간이 끝난 뒤 구매하기'],
      wait_days: 0,
    };
  if (sim.daysOfBudget != null && sim.daysOfBudget > 7)
    return {
      verdict: 'wait',
      headline: '살 수는 있지만 조금 미루는 걸 추천해요.',
      reasons: [
        `하루 한도 ${won(dailyLimit)}의 ${sim.daysOfBudget}일치예요.`,
        `사면 남은 기간 하루 한도가 ${won(sim.limitBefore)} → ${won(sim.limitAfter)}으로 줄어요.`,
      ],
      alternatives: ['2주 뒤에도 필요하면 그때 사기', '가격 비교 사이트에서 최저가 확인'],
      wait_days: 14,
    };
  return {
    verdict: 'buy',
    headline: '예산 안이라 사도 괜찮아요!',
    reasons: [`사도 남은 기간 하루 한도는 ${won(sim.limitAfter)}이에요.`],
    alternatives: [],
    wait_days: 0,
  };
}

export async function purchaseAdvice({ goal, item, sim, budget }) {
  const user = `사용자가 "${item}"을(를) ${won(sim.amount)}에 사려고 합니다. 아래 계산 결과를 근거로 구매 판단을 내려 주세요.
판단 기준:
- affordable=false(목표 달성 불가)면 skip.
- 하루 한도 며칠치(daysOfBudget)가 크거나, 사고 나서 하루 한도가 생활하기 빠듯해지면 wait (며칠 기다릴지 wait_days로).
- 부담이 작으면 buy.
- 물건의 성격(필수품인지, 충동구매 가능성이 큰지)도 고려하고, 현실적인 대안(중고, 저가 모델, 할인 시기 등)을 제시하세요.

${JSON.stringify(
  {
    목표: goal.title,
    목표금액: goal.target_amount,
    현재일일한도: budget.dailyLimit,
    남은일수: budget.remainingDays,
    계산결과: sim,
  },
  null,
  2,
)}`;

  const result = await generateJson({ system: SYSTEM, user, schema: PURCHASE_SCHEMA, name: 'purchase_advice' });
  if (result) {
    // 계산상 목표 달성이 불가능하면 AI가 뭐라 하든 '사도 됨'은 내보내지 않음
    if (!sim.affordable && result.data.verdict === 'buy') result.data.verdict = 'wait';
    return result;
  }
  return { data: rulePurchase(sim, budget.dailyLimit), provider: 'rule' };
}
