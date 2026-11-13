import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBudget,
  dailyLimitOn,
  dailySeries,
  paydaysBetween,
  rebalance,
  rebalanceIncome,
  simulatePurchase,
} from '../src/services/budget.js';

// 10일 동안 자산 50만원, 목표 20만원, 고정지출 10만원 → 가용 20만원 → 하루 2만원
const goal = {
  title: '테스트', target_amount: 200000, current_assets: 500000, fixed_costs: 100000,
  start_date: '2026-11-01', end_date: '2026-11-10', lunch_ratio: 0.4,
};

test('첫날 일일 한도와 점심값', () => {
  const b = computeBudget(goal, [], [], '2026-11-01');
  assert.equal(b.dailyLimit, 20000);
  assert.equal(b.lunchBudget, 8000);
  assert.equal(b.remainingDays, 10);
});

test('오늘 지출은 오늘 한도를 바꾸지 않고 다음 날부터 반영된다', () => {
  const ex = [{ spent_on: '2026-11-01', amount: 38000 }];
  assert.equal(computeBudget(goal, ex, [], '2026-11-01').dailyLimit, 20000);
  assert.equal(computeBudget(goal, ex, [], '2026-11-01').todayRemaining, -18000);
  // 남은 162,000원 / 9일 = 18,000원
  assert.equal(dailyLimitOn(goal, ex, [], '2026-11-02'), 18000);
});

test('돌발 지출 리밸런싱', () => {
  const newEx = { spent_on: '2026-11-01', amount: 45000 };
  const plan = rebalance(goal, [newEx], [], newEx);
  assert.equal(plan.daysLeft, 9);
  assert.equal(plan.before, 22200); // 200000/9 = 22222 → 100원 내림
  assert.equal(plan.after, 17200); // 155000/9 = 17222
  assert.equal(plan.remainingBudget, 155000);
});

test('예산 초과 시 한도는 0, onTrack false', () => {
  const ex = [{ spent_on: '2026-11-01', amount: 250000 }];
  const b = computeBudget(goal, ex, [], '2026-11-02');
  assert.equal(b.dailyLimit, 0);
  assert.equal(b.onTrack, false);
  assert.equal(b.expectedSavings, 150000);
});

test('기간 종료/시작 전', () => {
  assert.equal(computeBudget(goal, [], [], '2026-11-20').dailyLimit, 0);
  assert.equal(computeBudget(goal, [], [], '2026-10-25').notStarted, true);
  assert.equal(dailySeries(goal, [], [], '2026-10-25').length, 0);
  assert.equal(dailySeries(goal, [], [], '2026-11-03').length, 3);
});

test('목표가 보유 자산보다 커도 수입을 포함하면 가능', () => {
  // 200만원 모으기, 가진 돈 50만원, 월 200만원 수입 2번 → 가용 50+400-200 = 250만원 / 61일
  const g = { ...goal, target_amount: 2000000, current_assets: 500000, fixed_costs: 0,
    start_date: '2026-11-01', end_date: '2026-12-31' };
  const incomes = paydaysBetween(g.start_date, g.end_date, 25).map((d) => ({ received_on: d, amount: 2000000 }));
  assert.deepEqual(incomes.map((i) => i.received_on), ['2026-11-25', '2026-12-25']);
  const b = computeBudget(g, [], incomes, '2026-11-01');
  assert.equal(b.spendable, 2500000);
  assert.equal(b.dailyLimit, 40900); // 2500000/61 = 40983
  assert.deepEqual(b.nextIncome, { date: '2026-11-25', amount: 2000000 });
});

test('월급날 말일 보정과 기간 경계', () => {
  assert.deepEqual(paydaysBetween('2027-01-15', '2027-03-31', 31), ['2027-01-31', '2027-02-28', '2027-03-31']);
  assert.deepEqual(paydaysBetween('2026-11-26', '2026-12-20', 25), []);
  assert.deepEqual(paydaysBetween('2026-11-01', '2026-11-30', null), []);
});

test('구매 시뮬레이션', () => {
  // 가용 20만원 / 10일. 첫날 8만원짜리를 사면 내일부터 12만원/9일
  const r = simulatePurchase(goal, [], [], 80000, '2026-11-01');
  assert.equal(r.daysLeft, 9);
  assert.equal(r.limitBefore, 22200);
  assert.equal(r.limitAfter, 13300);
  assert.equal(r.affordable, true);
  assert.equal(r.daysOfBudget, 4);
  const big = simulatePurchase(goal, [], [], 350000, '2026-11-01');
  assert.equal(big.affordable, false);
  assert.equal(big.shortfall, 150000);
  assert.equal(big.expectedSavingsAfter, 50000);
});

test('수입 추가 시 오늘 한도부터 재계산', () => {
  const extra = { id: 9, received_on: '2026-11-01', amount: 50000 };
  const plan = rebalanceIncome(goal, [], [extra], extra, '2026-11-01');
  assert.equal(plan.before, 20000);
  assert.equal(plan.after, 25000);
  assert.equal(plan.diffPerDay, 5000);
});
