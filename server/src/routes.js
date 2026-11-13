import { Router } from 'express';
import { query } from './db.js';
import { getActiveGoal, getExpenses, getIncomes } from './data.js';
import {
  addDays,
  categoryBreakdown,
  computeBudget,
  dailyLimitOn,
  dailySeries,
  daysBetween,
  paydaysBetween,
  rebalance,
  rebalanceIncome,
  simulatePurchase,
  todayStr,
} from './services/budget.js';
import { analyzeDay, lunchTip, purchaseAdvice, rebalanceAdvice } from './services/coach.js';
import { configuredProviders } from './services/ai.js';
import { parseReceipt, parseTransactions } from './services/parser.js';
import { chat } from './services/assistant.js';
import { CATEGORIES } from './constants.js';

const router = Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const isDate = (v) => typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(v));
const isWon = (v) => Number.isInteger(v) && v >= 0 && v <= 2_000_000_000;
const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;

async function requireGoal() {
  const goal = await getActiveGoal();
  if (!goal) throw new HttpError(400, '먼저 저축 목표를 설정해 주세요.');
  return goal;
}

function checkInPeriod(goal, date) {
  if (!isDate(date)) throw new HttpError(400, '날짜 형식은 YYYY-MM-DD입니다.');
  if (date < goal.start_date || date > goal.end_date)
    throw new HttpError(400, '목표 기간 안의 날짜만 기록할 수 있어요.');
}

// ---------- 상태 ----------
router.get('/health', (_req, res) => {
  res.json({ ok: true, aiProviders: configuredProviders(), categories: CATEGORIES });
});

// ---------- 목표 ----------
router.get('/goal', async (_req, res) => {
  res.json(await getActiveGoal());
});

router.post('/goal', async (req, res) => {
  const {
    title,
    target_amount,
    current_assets,
    fixed_costs = 0,
    monthly_income = 0,
    start_date,
    end_date,
  } = req.body;
  const income_day = req.body.income_day ? Number(req.body.income_day) : null;
  const lunch_ratio = req.body.lunch_ratio ?? 0.4;

  if (!title?.trim()) throw new HttpError(400, '목표 이름을 입력해 주세요.');
  if (![target_amount, current_assets, fixed_costs, monthly_income].every(isWon))
    throw new HttpError(400, '금액은 0 이상의 정수(원)여야 합니다.');
  if (!isDate(start_date) || !isDate(end_date) || end_date < start_date)
    throw new HttpError(400, '기간을 올바르게 입력해 주세요.');
  if (!(lunch_ratio > 0 && lunch_ratio <= 1)) throw new HttpError(400, '점심 비율은 0~1 사이여야 합니다.');
  if (monthly_income > 0 && !(Number.isInteger(income_day) && income_day >= 1 && income_day <= 31))
    throw new HttpError(400, '수입이 들어오는 날짜(매월 1~31일)를 입력해 주세요.');

  const paydays = monthly_income > 0 ? paydaysBetween(start_date, end_date, income_day) : [];
  const expectedIncome = paydays.length * monthly_income;
  const spendable = current_assets + expectedIncome - target_amount - fixed_costs;
  if (spendable < 0)
    throw new HttpError(
      400,
      `기간 내 수입까지 합쳐도 ${won(-spendable)}이 부족해요. 기간을 늘리거나 목표 금액을 줄여 보세요.`,
    );

  await query('UPDATE goals SET is_active = FALSE WHERE is_active');
  const { rows } = await query(
    `INSERT INTO goals (title, target_amount, current_assets, fixed_costs, monthly_income, income_day,
                        start_date, end_date, lunch_ratio)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      title.trim(),
      target_amount,
      current_assets,
      fixed_costs,
      monthly_income,
      monthly_income > 0 ? income_day : null,
      start_date,
      end_date,
      lunch_ratio,
    ],
  );
  const goal = rows[0];

  // 월급날마다 예정 수입 자동 생성 (실제 금액이 다르면 기록 탭에서 수정/삭제 가능)
  for (const day of paydays) {
    await query(
      `INSERT INTO incomes (goal_id, received_on, amount, memo, is_planned) VALUES ($1, $2, $3, '월 수입', TRUE)`,
      [goal.id, day, monthly_income],
    );
  }
  res.status(201).json(goal);
});

// ---------- 예산 ----------
router.get('/budget/today', async (_req, res) => {
  const goal = await requireGoal();
  const [expenses, incomes] = await Promise.all([getExpenses(goal.id), getIncomes(goal.id)]);
  const today = todayStr();
  res.json({
    goal,
    budget: computeBudget(goal, expenses, incomes, today),
    series: dailySeries(goal, expenses, incomes, today),
    categories: categoryBreakdown(expenses),
  });
});

// 같은 날, 같은 점심 예산이면 AI를 다시 부르지 않고 저장된 추천을 사용 (비용 절약)
const lunchCache = new Map();

router.post('/coach/lunch', async (req, res) => {
  const goal = await requireGoal();
  const [expenses, incomes] = await Promise.all([getExpenses(goal.id), getIncomes(goal.id)]);
  const budget = computeBudget(goal, expenses, incomes);
  const key = `${goal.id}|${budget.day}|${budget.lunchBudget}`;

  if (!req.body?.refresh && lunchCache.has(key)) return res.json(lunchCache.get(key));
  const result = { ...(await lunchTip({ goal, budget })), lunchBudget: budget.lunchBudget };
  lunchCache.set(key, result);
  res.json(result);
});

// ---------- 지출 ----------
router.get('/expenses', async (req, res) => {
  const goal = await requireGoal();
  const date = req.query.date || todayStr();
  if (!isDate(date)) throw new HttpError(400, '날짜 형식은 YYYY-MM-DD입니다.');
  const { rows } = await query('SELECT * FROM expenses WHERE goal_id = $1 AND spent_on = $2 ORDER BY id', [
    goal.id,
    date,
  ]);
  res.json(rows);
});

router.post('/expenses', async (req, res) => {
  const goal = await requireGoal();
  const { amount, category, memo = '', is_unexpected = false } = req.body;
  const spent_on = req.body.spent_on || todayStr();

  if (!Number.isInteger(amount) || amount <= 0 || amount > 100_000_000)
    throw new HttpError(400, '금액은 1원 이상의 정수여야 합니다.');
  if (!CATEGORIES.includes(category)) throw new HttpError(400, '카테고리를 선택해 주세요.');
  checkInPeriod(goal, spent_on);

  const { rows } = await query(
    `INSERT INTO expenses (goal_id, spent_on, amount, category, memo, is_unexpected)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [goal.id, spent_on, amount, category, String(memo).slice(0, 200), Boolean(is_unexpected)],
  );
  const expense = rows[0];

  // 지출이 바뀌면 그날 리포트는 다시 받아야 하므로 삭제
  await query('DELETE FROM daily_reports WHERE goal_id = $1 AND report_date = $2', [goal.id, spent_on]);

  // 모든 지출 후 남은 기간 한도를 다시 계산해서 알려주고, 돌발 지출이면 AI 조언까지
  const [allExpenses, incomes] = await Promise.all([getExpenses(goal.id), getIncomes(goal.id)]);
  const plan = rebalance(goal, allExpenses, incomes, expense);
  let advice = null;
  if (!expense.is_unexpected) {
    // 일반 지출: '그날 한도'와 '내일부터 한도'를 비교 (한도 안에서 쓰면 내일 한도가 오히려 늘어남)
    plan.before = dailyLimitOn(goal, allExpenses, incomes, spent_on);
    plan.diffPerDay = plan.before - plan.after;
  } else {
    const r = await rebalanceAdvice({ goal, expense, plan });
    advice = { ...r.data, provider: r.provider };
  }
  res.status(201).json({ expense, recalculation: { plan, advice } });
});

router.delete('/expenses/:id', async (req, res) => {
  const goal = await requireGoal();
  const { rows } = await query('DELETE FROM expenses WHERE id = $1 AND goal_id = $2 RETURNING spent_on', [
    Number(req.params.id),
    goal.id,
  ]);
  if (!rows[0]) throw new HttpError(404, '지출을 찾을 수 없어요.');
  await query('DELETE FROM daily_reports WHERE goal_id = $1 AND report_date = $2', [goal.id, rows[0].spent_on]);
  res.status(204).end();
});

// ---------- 수입 ----------
router.get('/incomes', async (req, res) => {
  const goal = await requireGoal();
  if (req.query.date) {
    if (!isDate(req.query.date)) throw new HttpError(400, '날짜 형식은 YYYY-MM-DD입니다.');
    const { rows } = await query('SELECT * FROM incomes WHERE goal_id = $1 AND received_on = $2 ORDER BY id', [
      goal.id,
      req.query.date,
    ]);
    return res.json(rows);
  }
  res.json(await getIncomes(goal.id));
});

router.post('/incomes', async (req, res) => {
  const goal = await requireGoal();
  const { amount, memo = '' } = req.body;
  const received_on = req.body.received_on || todayStr();

  if (!Number.isInteger(amount) || amount <= 0 || amount > 2_000_000_000)
    throw new HttpError(400, '금액은 1원 이상의 정수여야 합니다.');
  checkInPeriod(goal, received_on);

  const { rows } = await query(
    `INSERT INTO incomes (goal_id, received_on, amount, memo) VALUES ($1, $2, $3, $4) RETURNING *`,
    [goal.id, received_on, amount, String(memo).slice(0, 200) || '수입'],
  );
  const income = rows[0];
  const plan = rebalanceIncome(goal, await getExpenses(goal.id), await getIncomes(goal.id), income);
  res.status(201).json({ income, recalculation: { plan, advice: null } });
});

router.delete('/incomes/:id', async (req, res) => {
  const goal = await requireGoal();
  const { rowCount } = await query('DELETE FROM incomes WHERE id = $1 AND goal_id = $2', [
    Number(req.params.id),
    goal.id,
  ]);
  if (!rowCount) throw new HttpError(404, '수입을 찾을 수 없어요.');
  res.status(204).end();
});

// ---------- AI 빠른 입력 (결제 문자 / 자연어) ----------
// 1단계: 붙여 넣은 내용을 해석해서 '미리보기'만 돌려준다 (DB에 저장하지 않음)
router.post('/parse', async (req, res) => {
  const goal = await requireGoal();
  const text = String(req.body.text ?? '').trim();
  if (!text) throw new HttpError(400, '문자나 문장을 붙여 넣어 주세요.');
  if (text.length > 5000) throw new HttpError(400, '한 번에 5,000자까지 붙여 넣을 수 있어요.');

  const today = todayStr();
  res.json(await toPreview(goal, await parseTransactions(text, today), today));
});

// 영수증 사진 → 미리보기 (GPT-4o / Gemini 이미지 인식)
router.post('/parse-image', async (req, res) => {
  const goal = await requireGoal();
  const m = /^data:(image\/(?:jpeg|png|webp|gif|heic|heif));base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.image ?? ''));
  if (!m) throw new HttpError(400, '이미지 파일(JPG, PNG, WEBP)을 올려 주세요.');
  if (m[2].length > 7_000_000) throw new HttpError(400, '이미지가 너무 커요. 5MB 이하로 올려 주세요.');

  const today = todayStr();
  const parsed = await parseReceipt({ mimeType: m[1], data: m[2] }, today);
  if (!parsed)
    throw new HttpError(
      400,
      configuredProviders().length
        ? 'AI가 영수증을 읽지 못했어요. 잠시 후 다시 시도해 주세요.'
        : '영수증 인식은 AI API 키가 있어야 사용할 수 있어요.',
    );
  res.json(await toPreview(goal, parsed, today));
});

/** AI 해석 결과를 검증·정리하고 중복/기간 체크를 붙인 미리보기로 변환 */
async function toPreview(goal, parsed, today) {
  const [expenses, incomes] = await Promise.all([getExpenses(goal.id), getIncomes(goal.id)]);

  const items = parsed.items
    .filter((i) => Number.isInteger(i.amount) && i.amount > 0)
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

// 2단계: 사용자가 확인/수정한 항목을 한 번에 등록하고 한도 변화를 알려준다
router.post('/records/bulk', async (req, res) => {
  const goal = await requireGoal();
  const items = Array.isArray(req.body.items) ? req.body.items : [];
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
  for (const d of dates)
    await query('DELETE FROM daily_reports WHERE goal_id = $1 AND report_date = $2', [goal.id, d]);

  const [expenses, incomes] = await Promise.all([getExpenses(goal.id), getIncomes(goal.id)]);
  const after = limitFromTomorrow(expenses, incomes);
  const sumOf = (type) => items.filter((i) => i.type === type).reduce((a, i) => a + i.amount, 0);

  res.status(201).json({
    count: items.length,
    recalculation: {
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
    },
  });
});

// ---------- "이거 사도 될까?" ----------
router.post('/coach/purchase', async (req, res) => {
  const goal = await requireGoal();
  const item = String(req.body.item ?? '').trim().slice(0, 100);
  const amount = req.body.amount;
  if (!item) throw new HttpError(400, '무엇을 살지 입력해 주세요.');
  if (!Number.isInteger(amount) || amount <= 0 || amount > 1_000_000_000)
    throw new HttpError(400, '가격을 입력해 주세요.');

  const today = todayStr();
  const [expenses, incomes] = await Promise.all([getExpenses(goal.id), getIncomes(goal.id)]);
  const budget = computeBudget(goal, expenses, incomes, today);
  const sim = simulatePurchase(goal, expenses, incomes, amount, today);
  const { data, provider } = await purchaseAdvice({ goal, item, sim, budget });
  res.json({ item, simulation: sim, dailyLimit: budget.dailyLimit, advice: data, provider });
});

// ---------- 대화형 AI 코치 (Function Calling) ----------
router.post('/chat', async (req, res) => {
  const goal = await requireGoal();
  const message = String(req.body.message ?? '').trim();
  if (!message) throw new HttpError(400, '메시지를 입력해 주세요.');
  if (message.length > 1000) throw new HttpError(400, '메시지는 1,000자까지 보낼 수 있어요.');

  // 최근 대화 12개만 맥락으로 사용 (비용/길이 제한)
  const history = (Array.isArray(req.body.history) ? req.body.history : [])
    .filter((h) => ['user', 'assistant'].includes(h?.role) && typeof h.content === 'string' && h.content.trim())
    .slice(-12)
    .map((h) => ({ role: h.role, content: h.content.slice(0, 2000) }));

  res.json(await chat(goal, history, message));
});

// ---------- AI 소비 분석 ----------
router.get('/analysis/daily', async (req, res) => {
  const goal = await requireGoal();
  const date = req.query.date || todayStr();
  const { rows } = await query('SELECT * FROM daily_reports WHERE goal_id = $1 AND report_date = $2', [
    goal.id,
    date,
  ]);
  res.json(rows[0] || null);
});

router.post('/analysis/daily', async (req, res) => {
  const goal = await requireGoal();
  const date = req.body.date || todayStr();
  if (!isDate(date)) throw new HttpError(400, '날짜 형식은 YYYY-MM-DD입니다.');

  const [all, incomes] = await Promise.all([getExpenses(goal.id), getIncomes(goal.id)]);
  const expenses = all.filter((e) => e.spent_on === date);
  if (expenses.length === 0) throw new HttpError(400, '이 날짜에 기록된 지출이 없어요.');

  const dailyLimit = dailyLimitOn(goal, all, incomes, date);
  const { data, provider } = await analyzeDay({ goal, date, dailyLimit, expenses });
  const { rows } = await query(
    `INSERT INTO daily_reports (goal_id, report_date, score, report, provider)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (goal_id, report_date)
     DO UPDATE SET score = EXCLUDED.score, report = EXCLUDED.report,
                   provider = EXCLUDED.provider, created_at = now()
     RETURNING *`,
    [goal.id, date, data.score, data, provider],
  );
  res.json(rows[0]);
});

export { router, HttpError };
