// 예산 계산은 AI가 아니라 코드로 한다 (LLM은 산수를 틀릴 수 있음).
// 모든 날짜는 'YYYY-MM-DD' 문자열, 금액은 원 단위 정수.
// expenses: [{ spent_on, amount }], incomes: [{ received_on, amount }]

const DAY_MS = 24 * 60 * 60 * 1000;

const toUtc = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export const fromUtc = (ms) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (s, n) => fromUtc(toUtc(s) + n * DAY_MS);

/** b - a (일 수) */
export const daysBetween = (a, b) => Math.round((toUtc(b) - toUtc(a)) / DAY_MS);

export function todayStr(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 100원 단위 내림, 음수는 0 */
export const floor100 = (n) => Math.max(0, Math.floor(n / 100) * 100);

const sum = (list) => list.reduce((acc, e) => acc + e.amount, 0);

/**
 * 기간 안의 월급날 목록. 그 달에 해당 날짜가 없으면(예: 31일) 말일로.
 * 예) 2026-11-10 ~ 2027-01-31, 25일 → ['2026-11-25', '2026-12-25', '2027-01-25']
 */
export function paydaysBetween(start, end, day) {
  if (!day) return [];
  const result = [];
  let [y, m] = start.split('-').map(Number);
  for (;;) {
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const date = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
    if (date > end) break;
    if (date >= start) result.push(date);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return result;
}

/**
 * 기간 전체에서 쓸 수 있는 돈
 * = 보유 자산 + 기간 내 수입(예정 포함) - 목표 저축액 - 고정 지출
 */
export const spendableTotal = (goal, incomes = []) =>
  goal.current_assets + sum(incomes) - goal.target_amount - goal.fixed_costs;

/**
 * 특정 날짜(day)의 일일 한도.
 * 그날 이전까지 쓴 돈만 반영하므로, 하루 중에 지출해도 오늘 한도는 바뀌지 않고
 * 초과분은 다음 날부터의 한도에 자동으로 나뉘어 반영된다(리밸런싱).
 * 수입이 추가되면 쓸 수 있는 돈이 늘어나 오늘 한도부터 바로 다시 계산된다.
 */
export function dailyLimitOn(goal, expenses, incomes, day) {
  const remainingDays = daysBetween(day, goal.end_date) + 1;
  if (remainingDays <= 0) return 0;
  const spentBefore = sum(expenses.filter((e) => e.spent_on < day));
  return floor100((spendableTotal(goal, incomes) - spentBefore) / remainingDays);
}

/** 오늘 기준 예산 현황 */
export function computeBudget(goal, expenses, incomes = [], today = todayStr()) {
  const notStarted = today < goal.start_date;
  const ended = today > goal.end_date;
  const day = notStarted ? goal.start_date : ended ? goal.end_date : today;

  const spendable = spendableTotal(goal, incomes);
  const totalSpent = sum(expenses);
  const spentToday = sum(expenses.filter((e) => e.spent_on === day));
  const dailyLimit = ended ? 0 : dailyLimitOn(goal, expenses, incomes, day);
  const totalDays = daysBetween(goal.start_date, goal.end_date) + 1;
  const remainingDays = ended ? 0 : daysBetween(day, goal.end_date) + 1;
  const upcoming = incomes
    .filter((i) => i.received_on > today)
    .sort((a, b) => a.received_on.localeCompare(b.received_on));

  return {
    day,
    notStarted,
    ended,
    totalDays,
    elapsedDays: totalDays - remainingDays,
    remainingDays,
    spendable,
    totalIncome: sum(incomes),
    receivedIncome: sum(incomes.filter((i) => i.received_on <= today)),
    nextIncome: upcoming[0] ? { date: upcoming[0].received_on, amount: upcoming[0].amount } : null,
    totalSpent,
    remainingBudget: spendable - totalSpent,
    dailyLimit,
    lunchBudget: floor100(dailyLimit * goal.lunch_ratio),
    spentToday,
    todayRemaining: dailyLimit - spentToday,
    // 남은 가용 예산이 음수면 이대로는 목표 달성이 불가능
    onTrack: spendable - totalSpent >= 0,
    expectedSavings: Math.max(0, Math.min(goal.target_amount, goal.target_amount + (spendable - totalSpent))),
  };
}

/**
 * 지출 후 리밸런싱: 이 지출이 없었을 때와 있을 때의
 * '내일부터 남은 기간의 일일 한도'를 비교한다.
 */
export function rebalance(goal, expensesWithNew, incomes, newExpense) {
  const day = newExpense.spent_on;
  const daysLeft = daysBetween(day, goal.end_date); // 내일부터 남은 일수
  const spentThrough = sum(expensesWithNew.filter((e) => e.spent_on <= day));
  const spendable = spendableTotal(goal, incomes);

  const limitFor = (spent) => (daysLeft > 0 ? floor100((spendable - spent) / daysLeft) : 0);
  const before = limitFor(spentThrough - newExpense.amount);
  const after = limitFor(spentThrough);

  return {
    kind: 'expense',
    amount: newExpense.amount,
    daysLeft,
    before,
    after,
    diffPerDay: before - after,
    remainingBudget: spendable - sum(expensesWithNew),
  };
}

/** 수입 추가 후 재계산: 오늘(또는 시작일)부터의 일일 한도 비교 */
export function rebalanceIncome(goal, expenses, incomesWithNew, newIncome, today = todayStr()) {
  const day = today < goal.start_date ? goal.start_date : today;
  const without = incomesWithNew.filter((i) => i !== newIncome && i.id !== newIncome.id);
  const daysLeft = Math.max(0, daysBetween(day, goal.end_date) + 1);
  const before = dailyLimitOn(goal, expenses, without, day);
  const after = dailyLimitOn(goal, expenses, incomesWithNew, day);
  return {
    kind: 'income',
    amount: newIncome.amount,
    daysLeft,
    before,
    after,
    diffPerDay: after - before,
    remainingBudget: spendableTotal(goal, incomesWithNew) - sum(expenses),
  };
}

/**
 * "이거 사도 될까?" 시뮬레이션: 지금(또는 date에) amount를 쓰면 남은 기간이 어떻게 바뀌는지.
 * 실제로 저장하지 않고 계산만 한다. AI 구매 판단과 챗봇 도구가 같이 사용.
 */
export function simulatePurchase(goal, expenses, incomes, amount, today = todayStr(), date = today) {
  const day = date < goal.start_date ? goal.start_date : date;
  const tomorrow = addDays(day, 1);
  const daysLeft = tomorrow > goal.end_date ? 0 : daysBetween(tomorrow, goal.end_date) + 1;
  const limitFrom = (exp) => (daysLeft > 0 ? dailyLimitOn(goal, exp, incomes, tomorrow) : 0);

  const withPurchase = [...expenses, { spent_on: day, amount }];
  const spendable = spendableTotal(goal, incomes);
  const before = computeBudget(goal, expenses, incomes, today);
  const remainingAfter = spendable - sum(withPurchase);
  const currentLimit = before.dailyLimit;

  return {
    amount,
    date: day,
    daysLeft,
    limitBefore: limitFrom(expenses),
    limitAfter: limitFrom(withPurchase),
    remainingBefore: before.remainingBudget,
    remainingAfter,
    affordable: remainingAfter >= 0,
    // 목표를 지키려면 모자란 금액 (0이면 목표 달성 가능)
    shortfall: Math.max(0, -remainingAfter),
    expectedSavingsAfter: Math.max(0, Math.min(goal.target_amount, goal.target_amount + remainingAfter)),
    // 이 물건 = 현재 하루 한도 며칠치
    daysOfBudget: currentLimit > 0 ? Math.round((amount / currentLimit) * 10) / 10 : null,
    // 하루 한도를 지금보다 하루 X원씩 덜 쓰면 며칠 만에 모이는지 (만원 아끼기 기준)
    daysToSaveAt10k: Math.ceil(amount / 10000),
  };
}

/** 최근 N일의 날짜별 한도/지출 (차트용) */
export function dailySeries(goal, expenses, incomes = [], today = todayStr(), days = 14) {
  const last = today > goal.end_date ? goal.end_date : today;
  if (last < goal.start_date) return [];
  let first = addDays(last, -(days - 1));
  if (first < goal.start_date) first = goal.start_date;

  const series = [];
  for (let d = first; d <= last; d = addDays(d, 1)) {
    series.push({
      date: d,
      limit: dailyLimitOn(goal, expenses, incomes, d),
      spent: sum(expenses.filter((e) => e.spent_on === d)),
    });
  }
  return series;
}

/** 카테고리별 합계 */
export function categoryBreakdown(expenses) {
  const map = new Map();
  for (const e of expenses) map.set(e.category, (map.get(e.category) || 0) + e.amount);
  return [...map.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}
