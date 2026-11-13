import { useEffect, useState } from 'react';
import { api, koreanWon, PROVIDER_LABEL, todayStr, won } from '../api.js';
import MoneyInput from './MoneyInput.jsx';
import QuickInput from './QuickInput.jsx';

const CATEGORIES = ['식비', '카페/간식', '교통', '쇼핑', '문화/여가', '생활', '의료', '기타'];
const EMOJI = { 식비: '🍚', '카페/간식': '☕', 교통: '🚌', 쇼핑: '🛍️', '문화/여가': '🎬', 생활: '🧻', 의료: '💊', 기타: '📦' };
const QUICK = [1000, 5000, 10000, 50000];

export default function ExpensePanel({ goal, onChange }) {
  const [kind, setKind] = useState('expense'); // expense | income
  const [date, setDate] = useState(() => {
    const t = todayStr();
    return t > goal.end_date ? goal.end_date : t < goal.start_date ? goal.start_date : t;
  });
  const [expenses, setExpenses] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [form, setForm] = useState({ amount: '', category: '식비', memo: '', is_unexpected: false });
  const [recalc, setRecalc] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    Promise.all([api.expenses(date), api.incomes(date)])
      .then(([e, i]) => {
        setExpenses(e);
        setIncomes(i);
      })
      .catch((e) => setError(e.message));
  }, [date, reloadKey]);

  async function submit(e) {
    e.preventDefault();
    if (!form.amount) return setError('금액을 입력해 주세요.');
    setSaving(true);
    setError('');
    try {
      if (kind === 'expense') {
        const res = await api.addExpense({ ...form, spent_on: date });
        setExpenses([...expenses, res.expense]);
        setRecalc(res.recalculation);
      } else {
        const res = await api.addIncome({ amount: form.amount, memo: form.memo, received_on: date });
        setIncomes([...incomes, res.income]);
        setRecalc(res.recalculation);
      }
      setForm({ ...form, amount: '', memo: '', is_unexpected: false });
      onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeExpense(id) {
    try {
      await api.deleteExpense(id);
      setExpenses(expenses.filter((x) => x.id !== id));
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeIncome(id) {
    try {
      await api.deleteIncome(id);
      setIncomes(incomes.filter((x) => x.id !== id));
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  const spentTotal = expenses.reduce((a, e) => a + e.amount, 0);
  const incomeTotal = incomes.reduce((a, e) => a + e.amount, 0);
  const isExpense = kind === 'expense';

  return (
    <div className="grid">
      <QuickInput
        onDone={(r) => {
          setRecalc(r);
          setReloadKey((k) => k + 1);
          onChange();
        }}
      />

      <form className="card form" onSubmit={submit}>
        <div className="segment">
          <button type="button" className={isExpense ? 'active' : ''} onClick={() => setKind('expense')}>
            지출
          </button>
          <button type="button" className={!isExpense ? 'active income' : ''} onClick={() => setKind('income')}>
            수입
          </button>
        </div>

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
        <label>
          금액
          <MoneyInput
            value={form.amount}
            onChange={(amount) => setForm({ ...form, amount })}
            placeholder={isExpense ? '8,500' : '300,000'}
            quick={QUICK}
          />
        </label>

        {isExpense && (
          <div className="cat-grid">
            {CATEGORIES.map((c) => (
              <button
                type="button"
                key={c}
                className={form.category === c ? 'active' : ''}
                onClick={() => setForm({ ...form, category: c })}
              >
                <span>{EMOJI[c]}</span>
                {c}
              </button>
            ))}
          </div>
        )}

        <label>
          메모
          <input
            value={form.memo}
            onChange={(e) => setForm({ ...form, memo: e.target.value })}
            placeholder={isExpense ? '예: 학식, 스타벅스 라떼' : '예: 알바비, 용돈, 중고 판매'}
            maxLength={200}
          />
        </label>

        {isExpense ? (
          <label className="check">
            <input
              type="checkbox"
              checked={form.is_unexpected}
              onChange={(e) => setForm({ ...form, is_unexpected: e.target.checked })}
            />
            <span>
              <b>돌발 지출</b>이에요 (병원비, 경조사 등 예상 못 한 지출 → AI가 남은 기간 조정 방법을 알려줘요)
            </span>
          </label>
        ) : (
          <p className="muted small">
            수입을 기록하면 쓸 수 있는 돈이 늘어나 오늘부터 하루 한도가 다시 계산돼요. 월 수입은 목표 설정 때 자동으로
            등록돼 있으니, 그 외의 추가 수입만 기록하세요.
          </p>
        )}

        {error && <div className="alert error">{error}</div>}
        <button className={`primary ${isExpense ? '' : 'income'}`} disabled={saving}>
          {saving
            ? form.is_unexpected
              ? 'AI가 예산 재조정 중...'
              : '저장 중...'
            : `${isExpense ? '지출' : '수입'} 기록하기`}
        </button>
      </form>

      <div className="stack">
        {recalc && <RecalcCard recalc={recalc} onClose={() => setRecalc(null)} />}

        <section className="card">
          <div className="card-head">
            <h3>{date} 기록</h3>
            <span className="small">
              {incomeTotal > 0 && <b className="pos">+{won(incomeTotal)} </b>}
              <b>-{won(spentTotal)}</b>
            </span>
          </div>
          {expenses.length + incomes.length === 0 ? (
            <p className="muted small">이 날은 아직 기록이 없어요.</p>
          ) : (
            <ul className="expenses">
              {incomes.map((x) => (
                <li key={`i${x.id}`}>
                  <span className="emoji">💰</span>
                  <div>
                    <b>{x.memo || '수입'}</b>
                    <span className="muted small">
                      수입{x.is_planned && <span className="tag calm">예정</span>}
                    </span>
                  </div>
                  <b className="amount pos">+{won(x.amount)}</b>
                  <button className="x" onClick={() => removeIncome(x.id)} aria-label="삭제">×</button>
                </li>
              ))}
              {expenses.map((x) => (
                <li key={`e${x.id}`}>
                  <span className="emoji">{EMOJI[x.category] || '📦'}</span>
                  <div>
                    <b>{x.memo || x.category}</b>
                    <span className="muted small">
                      {x.category}
                      {x.is_unexpected && <span className="tag">돌발</span>}
                    </span>
                  </div>
                  <b className="amount">-{won(x.amount)}</b>
                  <button className="x" onClick={() => removeExpense(x.id)} aria-label="삭제">×</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function RecalcCard({ recalc, onClose }) {
  const { plan, advice } = recalc;
  const isIncome = plan.kind === 'income';
  const isBulk = plan.kind === 'bulk';
  const changed = plan.before !== plan.after;

  if (isBulk) {
    return (
      <section className={`card rebalance ${plan.diffPerDay >= 0 ? 'up' : 'calm'}`}>
        <div className="card-head">
          <h3>✨ {plan.count}건 등록 완료</h3>
          <button className="x" onClick={onClose} aria-label="닫기">×</button>
        </div>
        {plan.daysLeft > 0 && (
          <div className="rebalance-numbers">
            <div>
              <span className="muted small">이전 하루 한도</span>
              <b className={changed ? 'strike' : ''}>{won(plan.before)}</b>
            </div>
            <span className="arrow">→</span>
            <div>
              <span className="muted small">내일부터 {plan.daysLeft}일 하루 한도</span>
              <b className={plan.diffPerDay >= 0 ? 'pos' : 'accent'}>{won(plan.after)}</b>
            </div>
          </div>
        )}
        <p className="small">
          지출 {koreanWon(plan.expenseTotal)}
          {plan.incomeTotal > 0 && `, 수입 ${koreanWon(plan.incomeTotal)}`}을 반영했어요. 남은 가용 예산은{' '}
          <b>{won(plan.remainingBudget)}</b>이에요.
        </p>
      </section>
    );
  }

  return (
    <section className={`card rebalance ${isIncome ? 'up' : advice ? '' : 'calm'}`}>
      <div className="card-head">
        <h3>{isIncome ? '💰 수입 반영 완료' : advice ? '⚡ 돌발 지출 리밸런싱' : '🔄 예산 다시 계산'}</h3>
        <button className="x" onClick={onClose} aria-label="닫기">×</button>
      </div>

      {plan.daysLeft > 0 ? (
        <>
          <div className="rebalance-numbers">
            <div>
              <span className="muted small">
                {isIncome ? '이전 하루 한도' : advice ? '조정 전 하루 한도' : '그날 하루 한도'}
              </span>
              <b className={changed ? 'strike' : ''}>{won(plan.before)}</b>
            </div>
            <span className="arrow">→</span>
            <div>
              <span className="muted small">
                {isIncome ? '오늘부터' : '내일부터'} {plan.daysLeft}일 하루 한도
              </span>
              <b className={isIncome ? 'pos' : 'accent'}>{won(plan.after)}</b>
            </div>
          </div>
          <p className="small">
            {isIncome
              ? `${koreanWon(plan.amount)} 수입으로 하루 ${won(plan.diffPerDay)}씩 더 쓸 수 있어요.`
              : advice
                ? `${koreanWon(plan.amount)} 돌발 지출을 남은 기간에 나눠서, 하루 한도가 ${won(plan.diffPerDay)} 줄었어요.`
                : plan.diffPerDay > 0
                  ? `그날 한도를 넘어서, 넘친 만큼 남은 기간에 나눠 하루 ${won(plan.diffPerDay)}씩 줄었어요.`
                  : plan.diffPerDay < 0
                    ? `한도 안에서 썼어요! 아낀 돈이 남은 기간에 나뉘어 하루 ${won(-plan.diffPerDay)}씩 늘었어요.`
                    : '딱 한도만큼 썼어요.'}{' '}
            남은 가용 예산은 <b>{won(plan.remainingBudget)}</b>이에요.
          </p>
        </>
      ) : (
        <p className="small">목표 기간의 마지막 날이라 남은 기간에 나눌 수 없어요.</p>
      )}

      {advice && (
        <>
          <p>{advice.message}</p>
          <ul className="list">
            {advice.actions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <span className="provider">by {PROVIDER_LABEL[advice.provider]}</span>
        </>
      )}
    </section>
  );
}
