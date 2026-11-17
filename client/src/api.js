async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `요청 실패 (${res.status})`);
  return data;
}

export const api = {
  health: () => request('GET', '/health'),
  getGoal: () => request('GET', '/goal'),
  saveGoal: (goal) => request('POST', '/goal', goal),
  today: () => request('GET', '/budget/today'),
  lunchTip: (refresh = false) => request('POST', '/coach/lunch', { refresh }),
  expenses: (date) => request('GET', `/expenses?date=${date}`),
  addExpense: (expense) => request('POST', '/expenses', expense),
  deleteExpense: (id) => request('DELETE', `/expenses/${id}`),
  incomes: (date) => request('GET', date ? `/incomes?date=${date}` : '/incomes'),
  addIncome: (income) => request('POST', '/incomes', income),
  deleteIncome: (id) => request('DELETE', `/incomes/${id}`),
  parse: (text) => request('POST', '/parse', { text }),
  parseImage: (image) => request('POST', '/parse-image', { image }),
  purchase: (item, amount) => request('POST', '/coach/purchase', { item, amount }),
  chat: (message, history) => request('POST', '/chat', { message, history }),
  bulk: (items, inboxIds) => request('POST', '/records/bulk', { items, inboxIds }),
  smsStatus: () => request('GET', '/sms/status'),
  smsInbox: () => request('GET', '/sms/inbox'),
  smsDismiss: (ids) => request('POST', '/sms/inbox/dismiss', { ids }),
  smsSettings: () => request('GET', '/sms/settings'),
  setSmsMode: (mode) => request('PUT', '/sms/settings', { mode }),
  rotateSmsToken: () => request('POST', '/sms/settings/token'),
  /** 연결 확인 (기록하지 않음) → 서버 안내 문구 */
  smsPing: async (token) => {
    const res = await fetch(`/api/sms/webhook?token=${encodeURIComponent(token)}`);
    return { ok: res.ok, text: await res.text() };
  },
  getReport: (date) => request('GET', `/analysis/daily?date=${date}`),
  analyze: (date) => request('POST', '/analysis/daily', { date }),
};

/** 12,345원 */
export const won = (n) => `${Math.round(n ?? 0).toLocaleString('ko-KR')}원`;

/** 한국식 단위: 200000 → 20만원, 1234567 → 123만 4,567원, 150000000 → 1억 5,000만원 */
export function koreanWon(n) {
  n = Math.round(n ?? 0);
  if (n === 0) return '0원';
  const sign = n < 0 ? '-' : '';
  n = Math.abs(n);
  const eok = Math.floor(n / 1e8);
  const man = Math.floor((n % 1e8) / 1e4);
  const rest = n % 1e4;
  const parts = [];
  if (eok) parts.push(`${eok.toLocaleString('ko-KR')}억`);
  if (man) parts.push(`${man.toLocaleString('ko-KR')}만`);
  if (rest) parts.push(rest.toLocaleString('ko-KR'));
  return `${sign}${parts.join(' ')}원`;
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 기간 안의 월급날 (서버 budget.js의 paydaysBetween과 같은 규칙) */
export function paydaysBetween(start, end, day) {
  if (!day || !start || !end || end < start) return [];
  const result = [];
  let [y, m] = start.split('-').map(Number);
  for (let guard = 0; guard < 600; guard++) {
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

export const PROVIDER_LABEL = { openai: 'OpenAI', gemini: 'Gemini', rule: '기본 코치' };

/** '3분 전' 같은 상대 시간 */
export function timeAgo(iso) {
  if (!iso) return '';
  const sec = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return '방금';
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  return `${Math.floor(sec / 86400)}일 전`;
}
