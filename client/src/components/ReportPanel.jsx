import { useEffect, useState } from 'react';
import { CircleCheck, FileText, ThumbsUp, TrendingDown } from 'lucide-react';
import { api, todayStr } from '../api.js';
import { AiTag, DateNav, formatDate } from './ui.jsx';

function grade(score) {
  if (score >= 90) return { label: '아주 잘했어요', tone: 'good' };
  if (score >= 70) return { label: '잘했어요', tone: 'good' };
  if (score >= 50) return { label: '조금 아쉬워요', tone: 'wait' };
  return { label: '절약이 필요해요', tone: 'stop' };
}

export default function ReportPanel({ goal }) {
  const [date, setDate] = useState(() => {
    const t = todayStr();
    return t > goal.end_date ? goal.end_date : t < goal.start_date ? goal.start_date : t;
  });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    setReport(null);
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
    <div className="report-page">
      <section className="card report-head">
        <DateNav date={date} min={goal.start_date} max={goal.end_date} onChange={setDate} />
        {error && <div className="alert error">{error}</div>}
        {!r && (
          <div className="report-empty">
            <div className="report-empty-icon">
              <FileText size={22} />
            </div>
            <b>{formatDate(date, false)} 소비를 돌아볼까요?</b>
            <p>그날 쓴 돈을 보고 점수와 함께 잘한 점, 아낄 수 있었던 점을 정리해 드려요.</p>
          </div>
        )}
        <button className={`btn ${r ? 'subtle' : 'primary'} block`} onClick={analyze} disabled={loading}>
          {loading ? '분석하는 중…' : r ? '다시 분석하기' : '이 날 분석하기'}
        </button>
      </section>

      {r && (
        <section className="card report">
          <div className="score-row">
            <div className={`score-ring ${g.tone}`} style={{ '--p': `${r.score * 3.6}deg` }}>
              <span>{r.score}</span>
            </div>
            <div className="score-text">
              <div className="score-label">
                <b className={`tone-text ${g.tone}`}>{g.label}</b>
                <AiTag />
              </div>
              <p>{r.summary}</p>
            </div>
          </div>

          {r.good_points.length > 0 && (
            <ReportSection Icon={ThumbsUp} title="잘한 점" tone="good">
              {r.good_points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ReportSection>
          )}
          {r.waste.length > 0 && (
            <ReportSection Icon={TrendingDown} title="아낄 수 있었던 지출" tone="stop">
              {r.waste.map((w) => (
                <li key={w.item}>
                  <b>{w.item}</b> {w.reason}
                </li>
              ))}
            </ReportSection>
          )}
          {r.tips.length > 0 && (
            <ReportSection Icon={CircleCheck} title="내일 해 볼 것" tone="accent">
              {r.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ReportSection>
          )}
        </section>
      )}
    </div>
  );
}

function ReportSection({ Icon, title, tone, children }) {
  return (
    <div className="report-section">
      <h4 className={`tone-text ${tone}`}>
        <Icon size={16} />
        {title}
      </h4>
      <ul className="bullets">{children}</ul>
    </div>
  );
}
