import { useEffect, useState } from 'react';
import { Smartphone, Zap } from 'lucide-react';
import { api, koreanWon, timeAgo } from '../api.js';
import PreviewList, { toRecord } from './PreviewList.jsx';

/**
 * 아이폰에서 들어온 결제 문자 확인 대기함 + 최근 자동 등록 내역.
 * version이 바뀌면(새 문자 도착) 다시 불러오되, 고치던 항목은 그대로 둔다.
 */
export default function SmsInbox({ version, onDone, onDismiss }) {
  const [rows, setRows] = useState([]); // 대기 중인 문자들
  const [items, setItems] = useState([]); // 모든 대기 항목 (inboxId 포함)
  const [recent, setRecent] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .smsInbox()
      .then((data) => {
        if (!alive) return;
        const ids = new Set(data.pending.map((r) => r.id));
        setRows(data.pending);
        setRecent(data.recentAuto);
        setItems((prev) => {
          const kept = prev.filter((i) => ids.has(i.inboxId));
          const known = new Set(kept.map((i) => i.inboxId));
          const added = data.pending
            .filter((r) => !known.has(r.id))
            .flatMap((r) => r.items.map((i) => ({ ...i, inboxId: r.id })));
          return [...kept, ...added];
        });
      })
      .catch(() => {}); // 목표가 없을 때 등은 조용히 숨김
    return () => {
      alive = false;
    };
  }, [version]);

  if (rows.length === 0 && recent.length === 0) return null;

  const chosen = items.filter((i) => i.selected);
  const ids = rows.map((r) => r.id);

  function update(idx, patch) {
    setItems((list) => list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      const res = await api.bulk(chosen.map(toRecord), ids);
      setRows([]);
      setItems([]);
      onDone(res.recalculation);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function dismissAll() {
    setBusy(true);
    setError('');
    try {
      await api.smsDismiss(ids);
      setRows([]);
      setItems([]);
      onDismiss();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`card sms-inbox ${rows.length ? 'has-pending' : ''}`}>
      <div className="card-title">
        <Smartphone size={18} />
        <h3>폰에서 받은 결제</h3>
        {rows.length > 0 && <span className="count-badge">확인 대기 {items.length}건</span>}
      </div>

      {rows.length > 0 && (
        <>
          <PreviewList items={items} onUpdate={update} />
          <details className="ignored">
            <summary>받은 문자 원문 {rows.length}건</summary>
            <ul>
              {rows.map((r) => (
                <li key={r.id}>
                  <span className="muted">{timeAgo(r.receivedAt)}</span> · {r.raw}
                </li>
              ))}
            </ul>
          </details>
          {error && <div className="alert error">{error}</div>}
          <div className="actions">
            <button type="button" className="btn text" onClick={dismissAll} disabled={busy}>
              모두 무시
            </button>
            <span className="spacer" />
            <button type="button" className="btn primary" onClick={save} disabled={busy || chosen.length === 0}>
              {busy ? '등록 중...' : `선택한 ${chosen.length}건 등록`}
            </button>
          </div>
          {chosen.length < items.length && <p className="hint right">체크하지 않은 항목은 기록하지 않아요.</p>}
        </>
      )}

      {recent.length > 0 && (
        <div className="recent-auto">
          <span className="recent-label">
            <Zap size={14} /> 자동으로 기록했어요
          </span>
          <ul>
            {recent.flatMap((r) =>
              r.items.map((i, k) => (
                <li key={`${r.id}-${k}`}>
                  <span>{i.memo || (i.type === 'income' ? '수입' : '지출')}</span>
                  <b className={i.type === 'income' ? 'pos' : ''}>
                    {i.type === 'income' ? '+' : '-'}
                    {koreanWon(i.amount)}
                  </b>
                  <span className="muted small">{timeAgo(r.receivedAt)}</span>
                </li>
              )),
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
