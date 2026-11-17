import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  CalendarDays,
  Calculator,
  ChartPie,
  CircleCheck,
  ClipboardList,
  Hand,
  Hourglass,
  ReceiptText,
  RotateCcw,
  ShoppingCart,
  Sparkles,
} from 'lucide-react';
import { api, koreanWon, won } from '../api.js';
import MoneyInput from './MoneyInput.jsx';
import { AiTag } from './ui.jsx';

export default function CoachPanel() {
  return (
    <div className="coach">
      <ChatBot />
      <PurchaseCheck />
    </div>
  );
}

// ---------- "이거 사도 될까?" ----------
const VERDICT = {
  buy: { Icon: CircleCheck, label: '사도 괜찮아요', tone: 'good' },
  wait: { Icon: Hourglass, label: '조금 기다려 봐요', tone: 'wait' },
  skip: { Icon: Hand, label: '지금은 참아요', tone: 'stop' },
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
    <section className="card purchase">
      <div className="card-title">
        <ShoppingCart size={18} />
        <h3>이거 사도 될까?</h3>
        <AiTag />
      </div>
      <p className="hint">사기 전에 물어보세요. 내 예산으로 계산해서 알려 드려요.</p>
      <form onSubmit={ask} className="purchase-form">
        <label className="field">
          <span className="field-label">사고 싶은 것</span>
          <input className="input" value={item} onChange={(e) => setItem(e.target.value)} placeholder="에어팟 프로, 겨울 패딩" required />
        </label>
        <label className="field">
          <span className="field-label">가격</span>
          <MoneyInput value={amount} onChange={setAmount} placeholder="0" required />
        </label>
        {error && <div className="alert error">{error}</div>}
        <button className="btn primary block" disabled={loading || !item.trim() || !amount}>
          {loading ? '계산하는 중…' : '물어보기'}
        </button>
      </form>

      {result && (
        <div className={`verdict ${v.tone}`}>
          <div className="verdict-head">
            <span className="verdict-badge">
              <v.Icon size={18} />
              {v.label}
              {result.advice.verdict === 'wait' && result.advice.wait_days > 0 && ` · ${result.advice.wait_days}일 뒤`}
            </span>
            <span className="verdict-item">
              {result.item} {koreanWon(sim.amount)}
            </span>
          </div>
          <p className="verdict-headline">{result.advice.headline}</p>

          <dl className="kv">
            <div>
              <dt>하루 한도</dt>
              <dd>
                {won(sim.limitBefore)} → <span className={sim.limitAfter < sim.limitBefore * 0.7 ? 'neg' : ''}>{won(sim.limitAfter)}</span>
              </dd>
            </div>
            <div>
              <dt>하루 한도로 치면</dt>
              <dd>{sim.daysOfBudget != null ? `${sim.daysOfBudget}일치` : '-'}</dd>
            </div>
            <div>
              <dt>목표 달성</dt>
              <dd className={sim.affordable ? 'pos' : 'neg'}>{sim.affordable ? '그래도 가능' : `${koreanWon(sim.shortfall)} 부족`}</dd>
            </div>
          </dl>

          {result.advice.reasons.length > 0 && (
            <ul className="bullets">
              {result.advice.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {result.advice.alternatives.length > 0 && (
            <div className="alternatives">
              <span className="field-label">이런 방법도 있어요</span>
              <ul className="bullets">
                {result.advice.alternatives.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
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
  get_budget_status: { label: '예산 확인', Icon: ClipboardList },
  get_spending_summary: { label: '지출 패턴 분석', Icon: ChartPie },
  get_transactions: { label: '거래 내역 확인', Icon: ReceiptText },
  get_daily_history: { label: '일별 기록 확인', Icon: CalendarDays },
  simulate_purchase: { label: '지출 계산', Icon: Calculator },
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
  text.split('\n').forEach((raw) => {
    const line = raw.trimEnd();
    const bullet = /^\s*(?:[-*•]|\d+\.)\s+(.*)$/.exec(line);
    if (bullet) {
      if (!list) blocks.push((list = { type: 'ul', items: [] }));
      list.items.push(inline(bullet[1]));
    } else {
      list = null;
      if (line.trim()) blocks.push({ type: 'p', content: inline(line) });
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
  const logRef = useRef(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      /* 저장 실패해도 대화는 계속 */
    }
    // 페이지 전체가 아니라 대화창 안에서만 스크롤
    const log = logRef.current;
    if (log) log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });
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
      setMessages((m) => [...m, { role: 'assistant', content: res.reply, toolCalls: res.toolCalls, provider: res.provider }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card chat">
      <div className="card-title">
        <Sparkles size={18} />
        <h3>AI 코치</h3>
        <span className="spacer" />
        {messages.length > 0 && (
          <button className="btn text small" onClick={() => setMessages([])}>
            <RotateCcw size={14} /> 새 대화
          </button>
        )}
      </div>

      <div className="chat-log" ref={logRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">
              <Sparkles size={22} />
            </div>
            <b>돈 쓰기 전에 편하게 물어보세요</b>
            <p>내 지출 기록을 직접 확인하고 답해 드려요.</p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)}>
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
                {[...new Set(m.toolCalls.map((t) => t.name))].map((n) => {
                  const t = TOOL_LABEL[n] || { label: n, Icon: ClipboardList };
                  return (
                    <span key={n} className="tool-chip">
                      <t.Icon size={12} />
                      {t.label}
                    </span>
                  );
                })}
              </div>
            )}
            {m.role === 'assistant' ? <RichText text={m.content} /> : <p>{m.content}</p>}
          </div>
        ))}
        {loading && (
          <div className="bubble assistant typing" aria-label="답변 작성 중">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>

      {error && <div className="alert error">{error}</div>}
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="이번 주 배달비 얼마나 썼어?" maxLength={1000} />
        <button className="send-btn" disabled={loading || !input.trim()} aria-label="보내기">
          <ArrowUp size={18} strokeWidth={2.5} />
        </button>
      </form>
    </section>
  );
}
