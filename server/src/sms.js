// 폰 결제 문자 자동 입력
// 아이폰 단축어 자동화가 문자를 받으면 POST /api/sms/webhook 으로 보내고,
// 설정에 따라 확인 대기함에 넣거나(inbox) 바로 등록한다(auto).
import crypto from 'node:crypto';
import os from 'node:os';
import { Router } from 'express';
import { query } from './db.js';
import { getActiveGoal } from './data.js';
import { todayStr } from './services/budget.js';
import { parseTransactions } from './services/parser.js';
import { HttpError, requireGoal, saveRecords, toPreview, validateRecords } from './records.js';

export const smsRouter = Router();

const MODES = ['inbox', 'auto'];
const MAX_TEXT = 2000;
const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;

// ---------- 설정 ----------
async function getSetting(key, fallback = null) {
  const { rows } = await query('SELECT value FROM app_settings WHERE key = $1', [key]);
  return rows.length ? rows[0].value : fallback;
}

async function setSetting(key, value) {
  await query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)],
  );
}

/** 폰에서 입력하기 쉽도록 16자 (96비트) */
const newToken = () => crypto.randomBytes(12).toString('base64url');

async function getToken() {
  const token = await getSetting('sms_token');
  if (token) return token;
  // 동시에 처음 요청이 와도 하나만 저장되도록 DO NOTHING 후 다시 읽음
  await query(`INSERT INTO app_settings (key, value) VALUES ('sms_token', $1) ON CONFLICT DO NOTHING`, [
    JSON.stringify(newToken()),
  ]);
  return getSetting('sms_token');
}

function sameToken(given, token) {
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(token));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** 같은 와이파이의 폰이 접속할 PC 주소들 */
function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.'))
    .map((i) => i.address);
}

export async function markInbox(ids, status) {
  await query(`UPDATE sms_inbox SET status = $2 WHERE id = ANY($1::int[]) AND status = 'pending'`, [ids, status]);
}

const toRecord = ({ type, amount, date, category, memo }) => ({ type, amount, date, category, memo });

// ---------- 폰 → 서버 ----------
// 응답은 단축어의 '알림 보기'에 그대로 띄울 수 있게 짧은 텍스트로 보낸다.
smsRouter.post('/webhook', async (req, res) => {
  const reply = (status, text) => res.status(status).type('text/plain').send(`저금이돈: ${text}`);

  const given = req.get('x-sms-token') ?? req.query.token ?? '';
  if (!sameToken(given, await getToken()))
    return reply(401, '연결 토큰이 맞지 않아요. 앱의 설정에서 주소를 다시 복사해 주세요.');

  const body = req.body;
  const text = String((typeof body === 'string' ? body : (body?.text ?? body?.message)) ?? '').trim();
  if (!text) return reply(400, '문자 내용이 비어 있어요. 단축어의 요청 본문에 text 항목을 넣어 주세요.');

  const goal = await getActiveGoal();
  if (!goal) return reply(409, '먼저 앱에서 저축 목표를 설정해 주세요.');

  const raw = text.slice(0, MAX_TEXT);
  const today = todayStr();
  const preview = await toPreview(goal, await parseTransactions(raw, today), today);
  const mode = await getSetting('sms_mode', 'inbox');

  const insert = (items, status, autoSaved = false) =>
    query(
      `INSERT INTO sms_inbox (goal_id, raw, items, ignored, provider, status, auto_saved)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [goal.id, raw, JSON.stringify(items), JSON.stringify(preview.ignored), preview.provider, status, autoSaved],
    );

  if (preview.items.length === 0) {
    await insert([], 'ignored');
    return reply(200, '결제·입금 내용이 없는 문자라 건너뛰었어요.');
  }

  // 자동 등록 모드여도 중복 의심·기간 밖 항목은 사람이 확인하도록 대기함으로 보낸다
  const toSave = mode === 'auto' ? preview.items.filter((i) => i.selected) : [];
  const toReview = preview.items.filter((i) => !toSave.includes(i));
  const parts = [];

  if (toSave.length) {
    const records = toSave.map(toRecord);
    validateRecords(goal, records);
    const { plan } = await saveRecords(goal, records);
    await insert(toSave, 'saved', true);
    const desc = toSave.map((i) => `${i.type === 'income' ? '수입' : '지출'} ${won(i.amount)}`).join(', ');
    parts.push(`${desc} 자동 등록 (내일부터 하루 ${won(plan.after)})`);
  }
  if (toReview.length) {
    await insert(toReview, 'pending');
    const why = toReview.some((i) => i.duplicate) ? ' (중복 의심 포함)' : '';
    parts.push(`${toReview.length}건을 확인 대기함에 넣었어요${why}`);
  }
  reply(201, parts.join(' / '));
});

// 아이폰 Safari로 주소를 열어 연결을 확인하는 용도 (아무것도 기록하지 않음)
smsRouter.get('/webhook', async (req, res) => {
  const ok = sameToken(req.get('x-sms-token') ?? req.query.token ?? '', await getToken());
  res
    .status(ok ? 200 : 401)
    .type('text/plain')
    .send(
      ok
        ? '저금이돈 연결 성공! 이 주소를 단축어의 URL에 넣으면 결제 문자가 자동으로 들어와요.'
        : '저금이돈: 연결 토큰이 맞지 않아요. 앱의 설정에서 주소를 다시 복사해 주세요.',
    );
});

// ---------- 앱 화면용 ----------
const rowOut = (r) => ({
  id: r.id,
  receivedAt: r.received_at,
  raw: r.raw,
  items: r.items,
  ignored: r.ignored,
  provider: r.provider,
});

/** 탭 배지·새로고침 판단용 (가볍게 자주 호출) */
smsRouter.get('/status', async (_req, res) => {
  const goal = await getActiveGoal();
  if (!goal) return res.json({ pending: 0, lastSavedAt: null });
  const { rows } = await query(
    `SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending,
            max(received_at) FILTER (WHERE auto_saved) AS last_saved_at
       FROM sms_inbox WHERE goal_id = $1`,
    [goal.id],
  );
  res.json({ pending: rows[0].pending, lastSavedAt: rows[0].last_saved_at });
});

smsRouter.get('/inbox', async (_req, res) => {
  const goal = await requireGoal();
  const [pending, recent] = await Promise.all([
    query(`SELECT * FROM sms_inbox WHERE goal_id = $1 AND status = 'pending' ORDER BY received_at, id`, [goal.id]),
    query(
      `SELECT * FROM sms_inbox WHERE goal_id = $1 AND auto_saved AND received_at > now() - interval '3 days'
        ORDER BY received_at DESC LIMIT 5`,
      [goal.id],
    ),
  ]);
  res.json({ pending: pending.rows.map(rowOut), recentAuto: recent.rows.map(rowOut) });
});

smsRouter.post('/inbox/dismiss', async (req, res) => {
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).filter(Number.isInteger);
  if (ids.length === 0) throw new HttpError(400, '무시할 항목을 골라 주세요.');
  await markInbox(ids, 'dismissed');
  res.status(204).end();
});

smsRouter.get('/settings', async (_req, res) => {
  const [mode, token, last] = await Promise.all([
    getSetting('sms_mode', 'inbox'),
    getToken(),
    query('SELECT max(received_at) AS at FROM sms_inbox'),
  ]);
  res.json({ mode, token, lanAddresses: lanAddresses(), lastReceivedAt: last.rows[0].at });
});

smsRouter.put('/settings', async (req, res) => {
  const { mode } = req.body;
  if (!MODES.includes(mode)) throw new HttpError(400, '등록 방식을 골라 주세요.');
  await setSetting('sms_mode', mode);
  res.json({ mode });
});

/** 토큰이 새어 나갔을 때 새로 발급 (기존 단축어는 주소를 다시 넣어야 함) */
smsRouter.post('/settings/token', async (_req, res) => {
  const token = newToken();
  await setSetting('sms_token', token);
  res.json({ token });
});
