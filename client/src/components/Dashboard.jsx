import { useEffect, useState } from 'react';
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarDays, CircleAlert, CircleCheck, Plus, RefreshCw, Target, Utensils } from 'lucide-react';
import { api, koreanWon, won } from '../api.js';
import { AiTag, CategoryIcon, formatDate, toneOf } from './ui.jsx';

// SVG 속성에는 CSS 변수가 적용되지 않아 실제 색상값 사용 (라이트/다크 모두 보이는 색)
const CHART = { spent: '#5b7cfa', over: '#ef5b5f', limit: '#9aa4b2', grid: 'rgba(140,150,165,0.18)', tick: '#8b95a1' };

export default function Dashboard({ data, onAdd }) {
  const { goal, budget, series, categories } = data;

  const over = budget.todayRemaining < 0;
  const usedPct = budget.dailyLimit > 0 ? Math.min(100, (budget.spentToday / budget.dailyLimit) * 100) : 100;
  const savePct = goal.target_amount > 0 ? Math.max(0, Math.min(100, (budget.expectedSavings / goal.target_amount) * 100)) : 100;
  const shortfall = Math.max(0, goal.target_amount - budget.expectedSavings);
  const catTotal = categories.reduce((a, c) => a + c.amount, 0) || 1;

  // 오늘을 뺀 최근 7일의 소비 습관
  const past = series.filter((s) => s.date < budget.day).slice(-7);
  const habits = past.length
    ? {
        days: past.length,
        yesterday: past.at(-1).spent,
        average: Math.round(past.reduce((a, s) => a + s.spent, 0) / past.length / 100) * 100,
        kept: past.filter((s) => s.spent <= s.limit).length,
      }
    : null;

  return (
    <div className="home">
      <section className="card today">
        <div className="today-top">
          <span className="eyebrow">{budget.ended ? goal.title : budget.notStarted ? '시작일에 쓸 수 있는 돈' : '오늘 쓸 수 있는 돈'}</span>
          {!budget.ended && <span className="chip">D-{budget.remainingDays}</span>}
        </div>

        {budget.ended ? (
          <>
            <div className="today-amount">목표 기간이 끝났어요</div>
            <p className="today-meta">설정에서 새 목표를 시작해 보세요.</p>
          </>
        ) : (
          <>
            <div className={`today-amount ${over ? 'neg' : ''}`}>
              {over ? '-' : ''}
              {Math.abs(budget.todayRemaining).toLocaleString('ko-KR')}
              <span>원</span>
            </div>
            <div className={`meter ${over ? 'over' : ''}`}>
              <div style={{ width: `${usedPct}%` }} />
            </div>
            <p className="today-meta">
              {over ? (
                <>
                  하루 한도 {won(budget.dailyLimit)}보다 <b className="neg">{won(-budget.todayRemaining)}</b> 더 썼어요.
                  내일부터 한도가 조금 줄어요.
                </>
              ) : (
                <>
                  하루 한도 {won(budget.dailyLimit)} 중 <b>{won(budget.spentToday)}</b> 썼어요
                </>
              )}
            </p>
            <button className="btn primary today-add" onClick={onAdd}>
              <Plus size={18} />
              지출 기록하기
            </button>
            {habits && (
              <div className="today-stats">
                <div>
                  <span>어제</span>
                  <b>{won(habits.yesterday)}</b>
                </div>
                <div>
                  <span>최근 {habits.days}일 평균</span>
                  <b>{won(habits.average)}</b>
                </div>
                <div>
                  <span>한도 지킨 날</span>
                  <b>
                    {habits.kept}/{habits.days}일
                  </b>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section className="card goal-card">
        <div className="card-title">
          <Target size={18} />
          <h3>{goal.title}</h3>
        </div>
        <div className="goal-numbers">
          <div>
            <span className="label">예상 저축</span>
            <b className={budget.onTrack ? 'pos' : 'neg'}>{koreanWon(budget.expectedSavings)}</b>
          </div>
          <div className="right">
            <span className="label">목표</span>
            <b>{koreanWon(goal.target_amount)}</b>
          </div>
        </div>
        <div className={`meter thin ${budget.onTrack ? 'good' : 'over'}`}>
          <div style={{ width: `${savePct}%` }} />
        </div>
        <p className={`status ${budget.onTrack ? 'ok' : 'bad'}`}>
          {budget.onTrack ? <CircleCheck size={16} /> : <CircleAlert size={16} />}
          {budget.onTrack ? '이대로면 목표를 달성할 수 있어요' : `이대로면 ${koreanWon(shortfall)}이 모자라요`}
        </p>
        <dl className="kv">
          <div>
            <dt>남은 예산</dt>
            <dd className={budget.remainingBudget < 0 ? 'neg' : ''}>{won(budget.remainingBudget)}</dd>
          </div>
          <div>
            <dt>지금까지 쓴 돈</dt>
            <dd>{won(budget.totalSpent)}</dd>
          </div>
          {budget.nextIncome && (
            <div>
              <dt>다음 수입</dt>
              <dd>
                {formatDate(budget.nextIncome.date, false)} · {koreanWon(budget.nextIncome.amount)}
              </dd>
            </div>
          )}
          <div>
            <dt>기간</dt>
            <dd>
              {budget.elapsedDays}/{budget.totalDays}일째
            </dd>
          </div>
        </dl>
      </section>

      {!budget.ended && <LunchCard budget={budget} />}

      <section className="card chart-card">
        <div className="card-title">
          <CalendarDays size={18} />
          <h3>최근 2주</h3>
          <div className="legend">
            <span>
              <i className="sw bar" /> 쓴 돈
            </span>
            <span>
              <i className="sw line" /> 하루 한도
            </span>
          </div>
        </div>
        {series.length === 0 ? (
          <p className="empty">아직 기록이 없어요.</p>
        ) : (
          <div className="chart">
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={series.map((s) => ({ ...s, label: `${Number(s.date.slice(8))}일` }))} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: CHART.tick }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 12, fill: CHART.tick }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => (v >= 10000 ? `${v / 10000}만` : v === 0 ? '0' : `${v / 1000}천`)}
                  width={44}
                />
                <Tooltip
                  formatter={(v, name) => [won(v), name]}
                  cursor={{ fill: 'rgba(140,150,165,0.12)' }}
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', color: '#17191c' }}
                />
                <Bar dataKey="spent" name="쓴 돈" radius={[6, 6, 0, 0]} maxBarSize={28} isAnimationActive={false}>
                  {series.map((s) => (
                    <Cell key={s.date} fill={s.spent > s.limit ? CHART.over : CHART.spent} />
                  ))}
                </Bar>
                <Line
                  dataKey="limit"
                  name="하루 한도"
                  stroke={CHART.limit}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  type="monotone"
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="card cat-card">
        <div className="card-title">
          <h3>어디에 썼나요</h3>
        </div>
        {categories.length === 0 ? (
          <p className="empty">지출을 기록하면 카테고리별로 보여 드려요.</p>
        ) : (
          <ul className="cat-list">
            {categories.map((c) => {
              const pct = Math.round((c.amount / catTotal) * 100);
              return (
                <li key={c.category} className={`tone-${toneOf(c.category)}`}>
                  <CategoryIcon category={c.category} />
                  <div className="cat-body">
                    <div className="cat-row">
                      <span>{c.category}</span>
                      <b>{won(c.amount)}</b>
                    </div>
                    <div className="cat-bar">
                      <div style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <span className="cat-pct">{pct}%</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function LunchCard({ budget }) {
  const [tip, setTip] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load(refresh = false) {
    setLoading(true);
    setError('');
    try {
      setTip(await api.lunchTip(refresh));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // 점심 예산이 바뀔 때마다 다시 불러옴 (서버에서 하루 단위로 캐시)
  useEffect(() => {
    load(false);
  }, [budget.lunchBudget]);

  return (
    <section className="card lunch-card">
      <div className="card-title">
        <Utensils size={18} />
        <h3>점심 추천</h3>
        <AiTag />
      </div>
      <p className="lunch-budget">
        오늘 점심은 <b>{won(budget.lunchBudget)}</b> 안에서
      </p>

      {loading && !tip && <div className="skeleton-list" aria-label="불러오는 중"><i /><i /><i /></div>}
      {tip && (
        <ul className="menu-list">
          {tip.data.menus.map((m) => (
            <li key={m.name}>
              <div>
                <b>{m.name}</b>
                <span>
                  {m.place} · {m.reason}
                </span>
              </div>
              <span className="price">{m.price > 0 ? won(m.price) : '0원'}</span>
            </li>
          ))}
        </ul>
      )}
      {error && <div className="alert error">{error}</div>}
      <button className="btn subtle" onClick={() => load(true)} disabled={loading}>
        <RefreshCw size={15} className={loading ? 'spin' : ''} />
        {loading ? '찾는 중…' : '다른 메뉴 보기'}
      </button>
    </section>
  );
}
