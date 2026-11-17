import { useCallback, useEffect, useRef, useState } from 'react';
import { ChartColumn, House, Inbox, MessageCircle, NotebookPen, Settings } from 'lucide-react';
import { api } from './api.js';
import GoalForm from './components/GoalForm.jsx';
import Dashboard from './components/Dashboard.jsx';
import ExpensePanel from './components/ExpensePanel.jsx';
import ReportPanel from './components/ReportPanel.jsx';
import CoachPanel from './components/CoachPanel.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import { Logo } from './components/ui.jsx';

const SMS_POLL_MS = 15000;

// id는 주소창 #해시로도 쓰여서 기존 값을 유지
const TABS = [
  { id: 'home', label: '홈', Icon: House },
  { id: 'expense', label: '가계부', Icon: NotebookPen },
  { id: 'coach', label: 'AI 코치', Icon: MessageCircle },
  { id: 'report', label: '리포트', Icon: ChartColumn },
  { id: 'goal', label: '설정', Icon: Settings },
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
    window.scrollTo({ top: 0 });
  };
  const [data, setData] = useState(null); // { goal, budget, series, categories }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [aiProviders, setAiProviders] = useState(null);

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
    api
      .health()
      .then((h) => setAiProviders(h.aiProviders))
      .catch(() => setAiProviders([]));
  }, [refresh]);

  // 폰에서 들어온 결제 문자 확인: 대기 건수는 탭 배지로, 자동 등록이 생기면 화면 데이터 새로고침
  const [sms, setSms] = useState({ pending: 0, lastSavedAt: null });
  const [smsTick, setSmsTick] = useState(0); // 올리면 바로 다시 확인
  const lastSaved = useRef(undefined);
  const hasGoalNow = Boolean(data?.goal);
  useEffect(() => {
    if (!hasGoalNow) return;
    let alive = true;
    const check = async () => {
      if (document.hidden) return;
      try {
        const st = await api.smsStatus();
        if (!alive) return;
        if (lastSaved.current !== undefined && st.lastSavedAt !== lastSaved.current) refresh();
        lastSaved.current = st.lastSavedAt;
        setSms((prev) => (prev.pending === st.pending && prev.lastSavedAt === st.lastSavedAt ? prev : st));
      } catch {
        /* 서버가 잠깐 꺼져 있어도 다음 주기에 다시 시도 */
      }
    };
    check();
    const timer = setInterval(check, SMS_POLL_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [hasGoalNow, refresh, smsTick]);
  const smsVersion = `${sms.pending}|${sms.lastSavedAt}`;

  if (loading)
    return (
      <div className="splash">
        <Logo size={40} />
      </div>
    );

  const hasGoal = Boolean(data?.goal);
  const current = hasGoal ? tab : 'goal';
  const aiOn = aiProviders?.length > 0;

  const nav = (className) => (
    <nav className={className} aria-label="메뉴">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={current === id ? 'active' : ''}
          onClick={() => setTab(id)}
          aria-current={current === id ? 'page' : undefined}
        >
          <span className="nav-icon">
            <Icon size={20} strokeWidth={current === id ? 2.4 : 2} />
          </span>
          <span>{label}</span>
          {id === 'expense' && sms.pending > 0 && (
            <span className="nav-badge" aria-label={`확인 대기 ${sms.pending}건`}>
              {sms.pending}
            </span>
          )}
        </button>
      ))}
    </nav>
  );

  return (
    <div className={`app ${hasGoal ? 'has-nav' : ''}`}>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <Logo />
            <span>저금이돈</span>
          </div>
          {hasGoal && nav('top-nav')}
          {aiProviders && (
            <span
              className={`ai-status ${aiOn ? 'on' : ''}`}
              title={aiOn ? aiProviders.join(', ') : 'server/.env에 API 키를 넣으면 AI가 켜져요'}
            >
              <span className="dot" />
              {aiOn ? 'AI 연결됨' : '기본 모드'}
            </span>
          )}
        </div>
      </header>

      <main className="page">
        {error && <div className="alert error">{error}</div>}

        {current === 'home' && sms.pending > 0 && (
          <button className="notice" onClick={() => setTab('expense')}>
            <Inbox size={18} />
            <span>
              폰에서 받은 결제 <b>{sms.pending}건</b>이 확인을 기다려요
            </span>
            <span className="notice-cta">확인하기</span>
          </button>
        )}

        {current === 'home' && <Dashboard data={data} onAdd={() => setTab('expense')} />}
        {current === 'expense' && (
          <ExpensePanel
            goal={data.goal}
            smsVersion={smsVersion}
            onChange={() => {
              refresh();
              setSmsTick((t) => t + 1);
            }}
          />
        )}
        {current === 'coach' && <CoachPanel />}
        {current === 'report' && <ReportPanel goal={data.goal} />}
        {current === 'goal' &&
          (hasGoal ? (
            <SettingsPanel
              goal={data.goal}
              onSaved={async () => {
                await refresh();
                setTab('home');
              }}
            />
          ) : (
            <div className="onboarding">
              <div className="onboarding-head">
                <Logo size={44} />
                <h1>모으고 싶은 돈이 있나요?</h1>
                <p>목표 금액과 기간을 알려 주면, 매일 얼마까지 써도 되는지 계산해 드려요.</p>
              </div>
              <GoalForm onSaved={refresh} />
            </div>
          ))}
      </main>

      {hasGoal && nav('bottom-nav')}
    </div>
  );
}
