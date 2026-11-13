import { useEffect, useRef, useState } from 'react';
import { api, koreanWon, PROVIDER_LABEL, won } from '../api.js';
import MoneyInput from './MoneyInput.jsx';

export default function CoachPanel() {
  return (
    <div className="grid coach">
      <PurchaseCheck />
      <ChatBot />
    </div>
  );
}

// ---------- "이거 사도 될까?" ----------
const VERDICT = {
  buy: { icon: '✅', label: '사도 돼요', cls: 'buy' },
  wait: { icon: '⏳', label: '조금 미뤄요', cls: 'wait' },
  skip: { icon: '✋', label: '지금은 참아요', cls: 'skip' },
};

function PurchaseCheck() {
  const [item, setItem] = useState('');
  const [amount, setAmount] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function ask(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      setResult(await api.purchase(item, Number(amount)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const v = result ? VERDICT[result.advice.verdict] : null;
  const sim = result?.simulation;

  return (
    <section className="card form purchase">
      <h3>🛒 이거 사도 될까?</h3>
      <p className="muted small">사기 전에 물어보세요. 내 예산으로 계산하고 AI가 판단해 줘요.</p>
      <form onSubmit={ask} className="purchase-form">
        <label>
          사고 싶은 것
          <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="예: 에어팟 프로, 겨울 패딩" required />
        </label>
        <label>
          가격
          <MoneyInput value={amount} onChange={setAmount} placeholder="350,000" required />
        </label>
        {error && <div className="alert error">{error}</div>}
        <button className="primary" disabled={loading || !item.trim() || !amount}>
          {loading ? 'AI가 고민 중...' : 'AI에게 물어보기'}
        </button>
      </form>

      {result && (
        <div className={`verdict ${v.cls}`}>
          <div className="verdict-head">
            <span className="verdict-badge">
              {v.icon} {v.label}
              {result.advice.verdict === 'wait' && result.advice.wait_days > 0 && ` (${result.advice.wait_days}일)`}
            </span>
            <span className="muted small">
              {result.item} · {koreanWon(sim.amount)}
            </span>
          </div>
          <b className="verdict-headline">{result.advice.headline}</b>

          <div className="sim-grid">
            <div>
              <span className="muted small">하루 한도 변화</span>
              <b>
                {won(sim.limitBefore)} → <span className={sim.limitAfter < sim.limitBefore * 0.7 ? 'neg' : ''}>{won(sim.limitAfter)}</span>
              </b>
            </div>
            <div>
              <span className="muted small">하루 한도의</span>
              <b>{sim.daysOfBudget != null ? `${sim.daysOfBudget}일치` : '-'}</b>
            </div>
            <div>
              <span className="muted small">목표 달성</span>
              <b className={sim.affordable ? 'pos' : 'neg'}>
                {sim.affordable ? '가능' : `${koreanWon(sim.shortfall)} 부족`}
              </b>
            </div>
          </div>

          {result.advice.reasons.length > 0 && (
            <ul className="list">
              {result.advice.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {result.advice.alternatives.length > 0 && (
            <>
              <h4>💡 대안</h4>
              <ul className="list">
                {result.advice.alternatives.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </>
          )}
          <span className="provider">by {PROVIDER_LABEL[result.provider]}</span>
        </div>
      )}
    </section>
  );
}

// ---------- 대화형 AI 코치 ----------
const SUGGESTIONS = [
  '이번 주말 친구랑 술 약속 있는데 얼마까지 써도 돼?',
  '이번 달 어디서 돈이 제일 새?',
  '요즘 한도 잘 지키고 있어?',
  '다음 월급까지 하루에 얼마씩 쓰면 돼?',
];

// AI가 호출한 도구를 사용자에게 보여줄 이름
const TOOL_LABEL = {
  get_budget_status: '📋 예산 현황 조회',
  get_spending_summary: '📊 지출 패턴 분석',
  get_transactions: '🧾 거래 내역 조회',
  get_daily_history: '📅 일별 기록 조회',
  simulate_purchase: '🧮 지출 시뮬레이션',
};

const STORAGE_KEY = 'jeogeumido-chat';

function loadChat() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

/** **굵게**와 '- ' 목록만 지원하는 작은 마크다운 렌더러 */
function RichText({ text }) {
  const inline = (line) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : part,
    );
  const blocks = [];
  let list = null;
  text.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = /^\s*(?:[-*•]|\d+\.)\s+(.*)$/.exec(line);
    if (bullet) {
      if (!list) blocks.push((list = { type: 'ul', items: [] }));
      list.items.push(inline(bullet[1]));
    } else {
      list = null;
      if (line.trim()) blocks.push({ type: 'p', content: inline(line), key: i });
    }
  });
  return blocks.map((b, i) =>
    b.type === 'ul' ? (
      <ul key={i}>
        {b.items.map((it, j) => (
          <li key={j}>{it}</li>
        ))}
      </ul>
    ) : (
      <p key={i}>{b.content}</p>
    ),
  );
}

function ChatBot() {
  const [messages, setMessages] = useState(loadChat); // [{ role, content, toolCalls?, provider? }]
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      /* 저장 실패해도 대화는 계속 */
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, loading]);

  async function send(text) {
    const message = text.trim();
    if (!message || loading) return;
    setInput('');
    setError('');
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: 'user', content: message }]);
    setLoading(true);
    try {
      const res = await api.chat(message, history);
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: res.reply, toolCalls: res.toolCalls, provider: res.provider },
      ]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card chat">
      <div className="card-head">
        <h3>💬 AI 코치에게 물어보기</h3>
        {messages.length > 0 && (
          <button className="link" onClick={() => setMessages([])}>
            새 대화
          </button>
        )}
      </div>

      <div className="chat-log">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p className="muted small">내 실제 지출 데이터를 보고 답해 줘요. 이렇게 물어보세요:</p>
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.role === 'assistant' && m.toolCalls?.length > 0 && (
              <div className="tool-calls">
                {[...new Set(m.toolCalls.map((t) => t.name))].map((n) => (
                  <span key={n} className="tool-chip">
                    {TOOL_LABEL[n] || n}
                  </span>
                ))}
              </div>
            )}
            {m.role === 'assistant' ? <RichText text={m.content} /> : <p>{m.content}</p>}
            {m.role === 'assistant' && <span className="provider">by {PROVIDER_LABEL[m.provider]}</span>}
          </div>
        ))}
        {loading && (
          <div className="bubble assistant typing">
            <span />
            <span />
            <span />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <div className="alert error">{error}</div>}
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="예: 이번 주 배달비 얼마나 썼어?"
          maxLength={1000}
        />
        <button className="primary" disabled={loading || !input.trim()}>
          보내기
        </button>
      </form>
    </section>
  );
}
