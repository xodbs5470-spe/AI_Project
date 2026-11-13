import { useEffect, useState } from 'react';
import { api, PROVIDER_LABEL, todayStr } from '../api.js';

function grade(score) {
  if (score >= 90) return { label: '최고예요', cls: 'pos' };
  if (score >= 70) return { label: '좋아요', cls: 'pos' };
  if (score >= 50) return { label: '조금 아쉬워요', cls: 'warn' };
  return { label: '절약이 필요해요', cls: 'neg' };
}

export default function ReportPanel({ goal }) {
  const [date, setDate] = useState(() => {
    const t = todayStr();
    return t > goal.end_date ? goal.end_date : t;
  });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api.getReport(date).then(setReport).catch((e) => setError(e.message));
  }, [date]);

  async function analyze() {
    setLoading(true);
    setError('');
    try {
      setReport(await api.analyze(date));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const r = report?.report;
  const g = r ? grade(r.score) : null;

  return (
    <div className="grid">
      <section className="card form">
        <h2>AI 소비 리포트</h2>
        <p className="muted small">하루 지출을 AI가 분석해 평점과 개선 피드백을 드려요.</p>
        <label>
          날짜
          <input
            type="date"
            value={date}
            min={goal.start_date}
            max={goal.end_date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        {error && <div className="alert error">{error}</div>}
        <button className="primary" onClick={analyze} disabled={loading}>
          {loading ? 'AI가 분석 중...' : report ? '다시 분석하기' : '분석하기'}
        </button>
      </section>

      {r && (
        <section className="card report">
          <div className="score-row">
            <div
              className={`score-ring ${g.cls}`}
              style={{ '--p': `${r.score * 3.6}deg` }}
            >
              <span>{r.score}</span>
            </div>
            <div>
              <b className={g.cls}>{g.label}</b>
              <p>{r.summary}</p>
            </div>
          </div>

          {r.good_points.length > 0 && (
            <>
              <h4>👍 잘한 점</h4>
              <ul className="list">
                {r.good_points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </>
          )}
          {r.waste.length > 0 && (
            <>
              <h4>💸 줄일 수 있었던 지출</h4>
              <ul className="list">
                {r.waste.map((w) => (
                  <li key={w.item}>
                    <b>{w.item}</b> — {w.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
          {r.tips.length > 0 && (
            <>
              <h4>✅ 내일 실천할 것</h4>
              <ul className="list">
                {r.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          )}
          <span className="provider">by {PROVIDER_LABEL[report.provider]}</span>
        </section>
      )}
    </div>
  );
}
