// 여러 건의 수입/지출 미리보기·검증·저장 (빠른 입력, 영수증, 폰 문자 자동 입력이 같이 사용)
import { query } from './db.js';
import { getActiveGoal, getExpenses, getIncomes } from './data.js';
import { addDays, computeBudget, dailyLimitOn, daysBetween, todayStr } from './services/budget.js';
import { CATEGORIES } from './constants.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDate = (v) => typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(v));

export async function requireGoal() {
  const goal = await getActiveGoal();
  if (!goal) throw new HttpError(400, '먼저 저축 목표를 설정해 주세요.');
  return goal;
}

/** AI 해석 결과를 검증·정리하고 중복/기간 체크를 붙인 미리보기로 변환 */
export async function toPreview(goal, parsed, today) {
  const [expenses, incomes] = await Promise.all([getExpenses(goal.id), getIncomes(goal.id)]);

  const items = parsed.items
    .filter((i) => Number.isInteger(i.amount) && i.amount > 0 && i.amount <= 100_000_000)
    .map((i) => {
      const type = i.type === 'income' ? 'income' : 'expense';
      const date = isDate(i.date) ? i.date : today;
      const inPeriod = date >= goal.start_date && date <= goal.end_date;
      // 같은 날 같은 금액이 이미 있으면 중복 가능성 표시 (같은 문자를 두 번 붙여 넣는 경우)
      const duplicate =
        type === 'expense'
          ? expenses.some((e) => e.spent_on === date && e.amount === i.amount)
          : incomes.some((e) => e.received_on === date && e.amount === i.amount);
      return {
        type,
        amount: i.amount,
        date,
        category: type === 'expense' && CATEGORIES.includes(i.category) ? i.category : '기타',
        memo: String(i.memo || i.merchant || '').slice(0, 200),
        inPeriod,
        duplicate,
        selected: inPeriod && !duplicate,
      };
    });

  return { items, ignored: parsed.ignored ?? [], provider: parsed.provider };
}

export function validateRecords(goal, items) {
  if (items.length === 0) throw new HttpError(400, '등록할 항목을 선택해 주세요.');
  if (items.length > 50) throw new HttpError(400, '한 번에 50건까지 등록할 수 있어요.');
  items.forEach((i, idx) => {
    const n = `${idx + 1}번째 항목`;
    if (!['expense', 'income'].includes(i.type)) throw new HttpError(400, `${n}: 수입/지출을 선택해 주세요.`);
    if (!Number.isInteger(i.amount) || i.amount <= 0 || i.amount > 100_000_000)
      throw new HttpError(400, `${n}: 금액이 올바르지 않아요.`);
    if (i.type === 'expense' && !CATEGORIES.includes(i.category))
      throw new HttpError(400, `${n}: 카테고리를 선택해 주세요.`);
    if (!isDate(i.date) || i.date < goal.start_date || i.date > goal.end_date)
      throw new HttpError(400, `${n}: 목표 기간 안의 날짜만 등록할 수 있어요.`);
  });
}

/** 검증된 항목을 저장하고 내일부터의 하루 한도 변화를 돌려준다 */
export async function saveRecords(goal, items) {
  const today = todayStr();
  const day = today < goal.start_date ? goal.start_date : today > goal.end_date ? goal.end_date : today;
  const tomorrow = addDays(day, 1);
  const limitFromTomorrow = (exp, inc) =>
    tomorrow > goal.end_date ? 0 : dailyLimitOn(goal, exp, inc, tomorrow);

  const before = limitFromTomorrow(await getExpenses(goal.id), await getIncomes(goal.id));

  const dates = new Set();
  for (const i of items) {
    const memo = String(i.memo ?? '').slice(0, 200);
    if (i.type === 'expense') {
      await query(
        `INSERT INTO expenses (goal_id, spent_on, amount, category, memo) VALUES ($1, $2, $3, $4, $5)`,
        [goal.id, i.date, i.amount, i.category, memo],
      );
      dates.add(i.date);
    } else {
      await query(`INSERT INTO incomes (goal_id, received_on, amount, memo) VALUES ($1, $2, $3, $4)`, [
        goal.id,
        i.date,
        i.amount,
        memo || '수입',
      ]);
    }
  }
  // 지출이 바뀐 날의 AI 리포트는 다시 만들도록 지움
  for (const d of dates)
    await query('DELETE FROM daily_reports WHERE goal_id = $1 AND report_date = $2', [goal.id, d]);

  const [expenses, incomes] = await Promise.all([getExpenses(goal.id), getIncomes(goal.id)]);
  const after = limitFromTomorrow(expenses, incomes);
  const sumOf = (type) => items.filter((i) => i.type === type).reduce((a, i) => a + i.amount, 0);

  return {
    plan: {
      kind: 'bulk',
      count: items.length,
      expenseTotal: sumOf('expense'),
      incomeTotal: sumOf('income'),
      daysLeft: tomorrow > goal.end_date ? 0 : daysBetween(tomorrow, goal.end_date) + 1,
      before,
      after,
      diffPerDay: after - before,
      remainingBudget: computeBudget(goal, expenses, incomes, today).remainingBudget,
    },
    advice: null,
  };
}
