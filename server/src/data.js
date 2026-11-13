// DB 조회 헬퍼 (라우트와 AI 도구가 같이 사용)
import { query } from './db.js';

export async function getActiveGoal() {
  const { rows } = await query('SELECT * FROM goals WHERE is_active ORDER BY id DESC LIMIT 1');
  return rows[0] || null;
}

export async function getExpenses(goalId) {
  const { rows } = await query('SELECT * FROM expenses WHERE goal_id = $1 ORDER BY spent_on, id', [goalId]);
  return rows;
}

export async function getIncomes(goalId) {
  const { rows } = await query('SELECT * FROM incomes WHERE goal_id = $1 ORDER BY received_on, id', [goalId]);
  return rows;
}
