// 대화형 AI 코치: Function Calling으로 사용자의 실제 데이터를 조회하며 답한다.
// AI는 숫자를 지어내지 않고, 필요한 도구를 스스로 골라 호출한 결과만 근거로 답한다.
import { getExpenses, getIncomes } from '../data.js';
import {
  categoryBreakdown,
  computeBudget,
  dailySeries,
  daysBetween,
  simulatePurchase,
  todayStr,
} from './budget.js';
import { runAgent } from './ai.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// ---------- AI에게 알려줄 도구 목록 ----------
const dateRange = {
  from: { type: 'string', description: '시작일 YYYY-MM-DD (생략하면 목표 시작일)' },
  to: { type: 'string', description: '종료일 YYYY-MM-DD (생략하면 오늘)' },
};

export const TOOLS = [
  {
    name: 'get_budget_status',
    description:
      '오늘 기준 예산 현황: 목표, 오늘 일일 한도, 점심 예산, 오늘 쓴 돈, 남은 가용 예산, 남은 일수, 수입, 목표 달성 가능 여부.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_spending_summary',
    description:
      '기간별 지출 분석: 총액, 하루 평균, 카테고리별 합계, 요일별 합계, 가장 많이 쓴 항목(메모) Top 5, 돌발 지출 합계. "어디서 돈이 새?" 같은 질문에 사용.',
    parameters: { type: 'object', properties: { ...dateRange } },
  },
  {
    name: 'get_transactions',
    description: '기간 내 수입/지출 내역 목록(최신순 최대 50건)과 합계. 특정 카테고리나 종류로 거를 수 있음.',
    parameters: {
      type: 'object',
      properties: {
        ...dateRange,
        type: { type: 'string', enum: ['expense', 'income', 'all'], description: '기본 all' },
        category: { type: 'string', description: '지출 카테고리(식비, 카페/간식, 교통, 쇼핑, 문화/여가, 생활, 의료, 기타)' },
      },
    },
  },
  {
    name: 'get_daily_history',
    description: '최근 N일 동안 날짜별 일일 한도와 실제 지출. 한도를 지킨 날/넘긴 날 확인에 사용.',
    parameters: {
      type: 'object',
      properties: { days: { type: 'integer', description: '조회할 일수 (1~60, 기본 14)' } },
    },
  },
  {
    name: 'simulate_purchase',
    description:
      '어떤 금액을 쓴다고 가정했을 때(저장하지 않음) 남은 기간 하루 한도 변화, 목표 달성 가능 여부, 부족액, 하루 한도 며칠치인지 계산. "얼마까지 써도 돼?", "이거 사도 돼?"에 사용.',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'integer', description: '쓸 금액(원)' },
        date: { type: 'string', description: '쓸 날짜 YYYY-MM-DD (생략하면 오늘)' },
      },
      required: ['amount'],
    },
  },
];

// ---------- 도구 실행 ----------
function range(goal, args, today) {
  const from = DATE_RE.test(args.from ?? '') ? args.from : goal.start_date;
  const to = DATE_RE.test(args.to ?? '') ? args.to : today;
  return { from, to };
}

export function makeExecutor(goal, today = todayStr()) {
  let cache;
  const load = async () =>
    (cache ??= await Promise.all([getExpenses(goal.id), getIncomes(goal.id)]).then(([expenses, incomes]) => ({
      expenses,
      incomes,
    })));

  return async function execute(name, args = {}) {
    const { expenses, incomes } = await load();
    switch (name) {
      case 'get_budget_status': {
        const b = computeBudget(goal, expenses, incomes, today);
        return {
          today,
          goal: {
            title: goal.title,
            target_amount: goal.target_amount,
            period: `${goal.start_date} ~ ${goal.end_date}`,
            monthly_income: goal.monthly_income,
          },
          dailyLimit: b.dailyLimit,
          lunchBudget: b.lunchBudget,
          spentToday: b.spentToday,
          todayRemaining: b.todayRemaining,
          remainingDays: b.remainingDays,
          remainingBudget: b.remainingBudget,
          totalSpent: b.totalSpent,
          totalIncome: b.totalIncome,
          nextIncome: b.nextIncome,
          onTrack: b.onTrack,
          expectedSavings: b.expectedSavings,
        };
      }
      case 'get_spending_summary': {
        const { from, to } = range(goal, args, today);
        const list = expenses.filter((e) => e.spent_on >= from && e.spent_on <= to);
        const total = list.reduce((a, e) => a + e.amount, 0);
        const days = Math.max(1, daysBetween(from, to) + 1);
        const byWeekday = WEEKDAYS.map((w) => ({ weekday: w, amount: 0 }));
        const byMemo = new Map();
        for (const e of list) {
          byWeekday[new Date(`${e.spent_on}T00:00:00`).getDay()].amount += e.amount;
          const key = e.memo || e.category;
          byMemo.set(key, (byMemo.get(key) || 0) + e.amount);
        }
        return {
          from,
          to,
          total,
          count: list.length,
          averagePerDay: Math.round(total / days),
          byCategory: categoryBreakdown(list),
          byWeekday,
          topItems: [...byMemo.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([memo, amount]) => ({ memo, amount })),
          unexpectedTotal: list.filter((e) => e.is_unexpected).reduce((a, e) => a + e.amount, 0),
        };
      }
      case 'get_transactions': {
        const { from, to } = range(goal, args, today);
        const type = ['expense', 'income'].includes(args.type) ? args.type : 'all';
        const rows = [
          ...(type !== 'income'
            ? expenses
                .filter((e) => e.spent_on >= from && e.spent_on <= to)
                .filter((e) => !args.category || e.category === args.category)
                .map((e) => ({ type: 'expense', date: e.spent_on, amount: e.amount, category: e.category, memo: e.memo, unexpected: e.is_unexpected }))
            : []),
          ...(type !== 'expense' && !args.category
            ? incomes
                .filter((i) => i.received_on >= from && i.received_on <= to)
                .map((i) => ({ type: 'income', date: i.received_on, amount: i.amount, memo: i.memo, planned: i.is_planned }))
            : []),
        ].sort((a, b) => b.date.localeCompare(a.date));
        const sumType = (t) => rows.filter((r) => r.type === t).reduce((a, r) => a + r.amount, 0);
        return { from, to, expenseTotal: sumType('expense'), incomeTotal: sumType('income'), count: rows.length, items: rows.slice(0, 50) };
      }
      case 'get_daily_history': {
        const days = Math.min(60, Math.max(1, Number(args.days) || 14));
        const series = dailySeries(goal, expenses, incomes, today, days);
        return {
          days: series.map((s) => ({ ...s, overLimit: s.spent > s.limit })),
          daysOverLimit: series.filter((s) => s.spent > s.limit).length,
        };
      }
      case 'simulate_purchase': {
        const amount = Math.round(Number(args.amount));
        if (!(amount > 0)) return { error: 'amount는 1 이상의 정수여야 합니다.' };
        const date = DATE_RE.test(args.date ?? '') ? args.date : today;
        return simulatePurchase(goal, expenses, incomes, amount, today, date);
      }
      default:
        return { error: `알 수 없는 도구: ${name}` };
    }
  };
}

// ---------- 대화 ----------
function systemPrompt(goal, today) {
  const weekday = WEEKDAYS[new Date(`${today}T00:00:00`).getDay()];
  return `당신은 절약 코칭 앱 '저금이돈'의 AI 코치입니다. 오늘은 ${today}(${weekday}요일)입니다.
사용자의 저축 목표: "${goal.title}" (${goal.start_date} ~ ${goal.end_date}).

원칙:
- 금액, 한도, 지출 내역 등 숫자가 필요한 답은 반드시 도구를 호출해서 확인한 값만 사용하세요. 추측하거나 지어내지 마세요.
- "이번 주", "지난주", "이번 달" 같은 표현은 오늘 날짜 기준으로 YYYY-MM-DD 범위로 바꿔 도구에 넘기세요.
- "얼마까지 써도 돼?"류 질문은 simulate_purchase로 몇 가지 금액을 비교해 보고 구체적인 금액을 제안하세요.
- 답변은 한국어로 3~6문장, 친근하지만 솔직하게. 핵심 숫자는 굵게(**) 표시하고, 필요하면 짧은 목록을 사용하세요.
- 금액은 '3만 2천원'이나 '32,000원'처럼 읽기 쉽게 쓰세요.
- 돈 관리와 관계없는 질문에는 짧게 답하고 절약 이야기로 자연스럽게 돌아오세요.`;
}

/** 키가 없을 때: 예산 현황만이라도 알려준다 */
async function fallbackReply(execute) {
  const s = await execute('get_budget_status');
  return [
    'AI 키가 없어서 자세한 대화는 어렵지만, 지금 예산 현황을 알려드릴게요.',
    `- 오늘 한도 **${s.dailyLimit.toLocaleString('ko-KR')}원** (사용 ${s.spentToday.toLocaleString('ko-KR')}원)`,
    `- 남은 가용 예산 **${s.remainingBudget.toLocaleString('ko-KR')}원**, 남은 ${s.remainingDays}일`,
    s.onTrack ? '- 지금 페이스면 목표 달성 가능해요!' : '- 이대로면 목표 달성이 어려워요. 지출을 줄여 봐요.',
  ].join('\n');
}

export async function chat(goal, history, message) {
  const today = todayStr();
  const execute = makeExecutor(goal, today);
  const result = await runAgent({ system: systemPrompt(goal, today), history, message, tools: TOOLS, execute });
  if (result) return result;
  return { reply: await fallbackReply(execute), toolCalls: [{ name: 'get_budget_status', args: {} }], provider: 'rule' };
}
