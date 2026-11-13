import { useEffect, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, koreanWon, PROVIDER_LABEL, won } from '../api.js';

// SVG 속성에는 CSS 변수가 적용되지 않아 실제 색상값 사용 (라이트/다크 모두 보이는 색)
const CHART = { spent: '#2fb37c', limit: '#e0a23a', grid: 'rgba(128,140,134,0.25)', tick: '#8a978f' };

export default function Dashboard({ data }) {
  const { goal, budget, series, categories } = data;
  const [tip, setTip] = useState(null);
  const [tipLoading, setTipLoading] = useState(false);
  const [tipError, setTipError] = useState('');

  async function loadTip(refresh = false) {
    setTipLoading(true);
    setTipError('');
    try {
      setTip(await api.lunchTip(refresh));
    } catch (e) {
      setTipError(e.message);
    } finally {
      setTipLoading(false);
    }
  }

  // 점심 예산이 바뀔 때마다 메뉴 추천을 자동으로 불러옴 (서버에서 하루 단위로 캐시)
  useEffect(() => {
    if (!budget.ended) loadTip(false);
  }, [budget.lunchBudget, budget.ended]);

  const over = budget.todayRemaining < 0;
  const usedPct = budget.dailyLimit > 0 ? Math.min(100, (budget.spentToday / budget.dailyLimit) * 100) : 100;
  const periodPct = (budget.elapsedDays / budget.totalDays) * 100;
  const maxCat = categories[0]?.amount || 1;

  return (
    <div className="grid">
      <section className="card hero">
        <div className="hero-head">
          <span className="muted">{goal.title}</span>
          <span className="pill">D-{budget.remainingDays}</span>
        </div>
        {budget.ended ? (
          <h2 className="big">목표 기간이 끝났어요 🎉</h2>
        ) : (
          <>
            <p className="muted small">{budget.notStarted ? '시작일' : '오늘'}의 지출 한도</p>
            <h2 className="big">{won(budget.dailyLimit)}</h2>
            <div className="meter">
              <div className={`fill ${over ? 'over' : ''}`} style={{ width: `${usedPct}%` }} />
            </div>
            <div className="meter-labels">
              <span>사용 {won(budget.spentToday)}</span>
              <span className={over ? 'neg' : 'pos'}>
                {over ? `${won(-budget.todayRemaining)} 초과` : `${won(budget.todayRemaining)} 남음`}
              </span>
            </div>
          </>
        )}
      </section>

      <section className="card lunch">
        <div className="card-head">
          <h3>🍱 오늘의 점심 예산</h3>
          <b className="accent">{won(budget.lunchBudget)}</b>
        </div>

        {tipLoading && !tip && <p className="muted small">예산에 맞는 메뉴를 찾는 중...</p>}
        {tip && (
          <>
            <p className="small">{tip.data.message}</p>
            <ul className="menus">
              {tip.data.menus.map((m) => (
                <li key={m.name}>
                  <div>
                    <b>{m.name}</b>
                    <span className="muted small">
                      {m.place} · {m.reason}
                    </span>
                  </div>
                  <span className="price">{m.price > 0 ? `약 ${won(m.price)}` : '0원'}</span>
                </li>
              ))}
            </ul>
            <span className="provider">by {PROVIDER_LABEL[tip.provider]}</span>
          </>
        )}
        {tipError && <div className="alert error">{tipError}</div>}
        <button className="ghost" onClick={() => loadTip(true)} disabled={tipLoading}>
          {tipLoading ? 'AI가 생각 중...' : '다른 메뉴 추천받기'}
        </button>
      </section>

      <section className="card stats">
        <div className="stat">
          <span className="muted small">남은 가용 예산</span>
          <b className={budget.remainingBudget < 0 ? 'neg' : ''}>{won(budget.remainingBudget)}</b>
        </div>
        <div className="stat">
          <span className="muted small">기간 내 수입 (예정 포함)</span>
          <b className="pos">{koreanWon(budget.totalIncome)}</b>
        </div>
        {budget.nextIncome && (
          <div className="stat">
            <span className="muted small">다음 수입</span>
            <b>
              {budget.nextIncome.date.slice(5).replace('-', '/')} · {koreanWon(budget.nextIncome.amount)}
            </b>
          </div>
        )}
        <div className="stat">
          <span className="muted small">지금까지 쓴 돈</span>
          <b>{won(budget.totalSpent)}</b>
        </div>
        <div className="stat">
          <span className="muted small">예상 저축액 / 목표</span>
          <b className={budget.onTrack ? 'pos' : 'neg'}>
            {koreanWon(budget.expectedSavings)} / {koreanWon(goal.target_amount)}
          </b>
        </div>
        <div className="period">
          <div className="meter thin">
            <div className="fill calm" style={{ width: `${periodPct}%` }} />
          </div>
          <span className="muted small">
            {goal.start_date} ~ {goal.end_date} · {budget.elapsedDays}/{budget.totalDays}일 경과
          </span>
        </div>
      </section>

      <section className="card wide">
        <h3>최근 지출 vs 일일 한도</h3>
        {series.length === 0 ? (
          <p className="muted small">아직 데이터가 없어요.</p>
        ) : (
          <div className="chart">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={series.map((s) => ({ ...s, label: s.date.slice(5) }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: CHART.tick }} stroke={CHART.grid} />
                <YAxis
                  tick={{ fontSize: 12, fill: CHART.tick }}
                  stroke={CHART.grid}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  width={40}
                />
                <Tooltip formatter={(v) => won(v)} contentStyle={{ borderRadius: 10, color: '#1d2a24' }} />
                <Legend />
                <Bar dataKey="spent" name="지출" fill={CHART.spent} radius={[6, 6, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                <Line dataKey="limit" name="한도" stroke={CHART.limit} strokeWidth={2.5} dot={{ r: 3 }} type="monotone" isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="card wide">
        <h3>카테고리별 지출</h3>
        {categories.length === 0 ? (
          <p className="muted small">지출을 기록하면 여기에 표시돼요.</p>
        ) : (
          <ul className="bars">
            {categories.map((c) => (
              <li key={c.category}>
                <span>{c.category}</span>
                <div className="bar">
                  <div style={{ width: `${(c.amount / maxCat) * 100}%` }} />
                </div>
                <b>{won(c.amount)}</b>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
