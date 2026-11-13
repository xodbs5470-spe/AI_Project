import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import GoalForm from './components/GoalForm.jsx';
import Dashboard from './components/Dashboard.jsx';
import ExpensePanel from './components/ExpensePanel.jsx';
import ReportPanel from './components/ReportPanel.jsx';
import CoachPanel from './components/CoachPanel.jsx';

const TABS = [
  { id: 'home', label: '오늘' },
  { id: 'expense', label: '수입·지출' },
  { id: 'coach', label: 'AI 코치' },
  { id: 'report', label: 'AI 리포트' },
  { id: 'goal', label: '목표 설정' },
];

export default function App() {
  // 주소창 #탭이름 으로 현재 탭 유지 (새로고침해도 같은 탭)
  const [tab, setTabState] = useState(() => {
    const h = window.location.hash.slice(1);
    return TABS.some((t) => t.id === h) ? h : 'home';
  });
  const setTab = (id) => {
    setTabState(id);
    window.history.replaceState(null, '', `#${id}`);
  };
  const [data, setData] = useState(null); // { goal, budget, series, categories }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [aiProviders, setAiProviders] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const goal = await api.getGoal();
      setData(goal ? await api.today() : null);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    api.health().then((h) => setAiProviders(h.aiProviders)).catch(() => {});
  }, [refresh]);

  if (loading) return <div className="center muted">불러오는 중...</div>;

  const hasGoal = Boolean(data?.goal);
  const current = hasGoal ? tab : 'goal';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">🐷</span>
          <div>
            <h1>저금이돈</h1>
            <p>AI 맞춤형 지출 관리 & 절약 코칭</p>
          </div>
        </div>
        <span className={`ai-badge ${aiProviders.length ? 'on' : ''}`}>
          AI {aiProviders.length ? aiProviders.join(' · ') : '키 없음(기본 코치)'}
        </span>
      </header>

      {hasGoal && (
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={current === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      )}

      {error && <div className="alert error">{error}</div>}

      <main>
        {current === 'home' && <Dashboard data={data} />}
        {current === 'expense' && <ExpensePanel goal={data.goal} onChange={refresh} />}
        {current === 'coach' && <CoachPanel />}
        {current === 'report' && <ReportPanel goal={data.goal} />}
        {current === 'goal' && (
          <GoalForm
            current={data?.goal}
            onSaved={async () => {
              await refresh();
              setTab('home');
            }}
          />
        )}
      </main>
    </div>
  );
}
