import { useEffect, useState } from 'react';
import { ArrowRight, Trash2, X } from 'lucide-react';
import { api, koreanWon, todayStr, won } from '../api.js';
import MoneyInput from './MoneyInput.jsx';
import QuickInput from './QuickInput.jsx';
import SmsInbox from './SmsInbox.jsx';
import { AiTag, CATEGORIES, CategoryIcon, DateNav } from './ui.jsx';

const QUICK = [1000, 5000, 10000, 50000];

export default function ExpensePanel({ goal, onChange, smsVersion }) {
  const clampToGoal = (d) => (d > goal.end_date ? goal.end_date : d < goal.start_date ? goal.start_date : d);
  const [kind, setKind] = useState('expense'); // expense | income
  const [form, setForm] = useState({ amount: '', category: '식비', memo: '', is_unexpected: false, date: clampToGoal(todayStr()) });
  const [listDate, setListDate] = useState(() => clampToGoal(todayStr()));
  const [expenses, setExpenses] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [recalc, setRecalc] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    Promise.all([api.expenses(listDate), api.incomes(listDate)])
      .then(([e, i]) => {
        setExpenses(e);
        setIncomes(i);
      })
      .catch((e) => setError(e.message));
  }, [listDate, reloadKey, smsVersion]); // 폰에서 자동 등록된 결제가 오면 목록도 새로

  const isExpense = kind === 'expense';
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function submit(e) {
    e.preventDefault();
    if (!form.amount) return setError('금액을 입력해 주세요.');
    setSaving(true);
    setError('');
    try {
      const res = isExpense
        ? await api.addExpense({
            amount: form.amount,
            category: form.category,
            memo: form.memo,
            is_unexpected: form.is_unexpected,
            spent_on: form.date,
          })
        : await api.addIncome({ amount: form.amount, memo: form.memo, received_on: form.date });
      setRecalc(res.recalculation);
      set({ amount: '', memo: '', is_unexpected: false });
      setListDate(form.date);
      setReloadKey((k) => k + 1);
      onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(type, id) {
    try {
      if (type === 'income') {
        await api.deleteIncome(id);
        setIncomes((l) => l.filter((x) => x.id !== id));
      } else {
        await api.deleteExpense(id);
        setExpenses((l) => l.filter((x) => x.id !== id));
      }
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  const onRecordsSaved = (r) => {
    setRecalc(r);
    setReloadKey((k) => k + 1);
    onChange();
  };

  const spentTotal = expenses.reduce((a, e) => a + e.amount, 0);
  const incomeTotal = incomes.reduce((a, e) => a + e.amount, 0);
  const rows = [
    ...incomes.map((x) => ({ ...x, type: 'income' })),
    ...expenses.map((x) => ({ ...x, type: 'expense' })),
  ];

  return (
    <div className="ledger">
      <SmsInbox version={smsVersion} onDone={onRecordsSaved} onDismiss={onChange} />

      <div className="ledger-col">
        <form className="card add-form" onSubmit={submit}>
          <div className="segment" role="tablist">
            <button type="button" role="tab" aria-selected={isExpense} className={isExpense ? 'active' : ''} onClick={() => setKind('expense')}>
              지출
            </button>
            <button type="button" role="tab" aria-selected={!isExpense} className={!isExpense ? 'active' : ''} onClick={() => setKind('income')}>
              수입
            </button>
          </div>

          <div className="field">
            <span className="field-label">얼마{isExpense ? '를 썼나요' : '가 들어왔나요'}?</span>
            <MoneyInput
              big
              value={form.amount}
              onChange={(amount) => set({ amount })}
              placeholder="0"
              quick={QUICK}
            />
          </div>

          {isExpense && (
            <div className="field">
              <span className="field-label">어디에 썼나요?</span>
              <div className="cat-picker">
                {CATEGORIES.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={form.category === c ? 'active' : ''}
                    onClick={() => set({ category: c })}
                    aria-pressed={form.category === c}
                  >
                    <CategoryIcon category={c} size={18} />
                    <span>{c}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="field-row">
            <label className="field grow">
              <span className="field-label">메모</span>
              <input
                className="input"
                value={form.memo}
                onChange={(e) => set({ memo: e.target.value })}
                placeholder={isExpense ? '학식, 스타벅스 라떼' : '알바비, 용돈'}
                maxLength={200}
              />
            </label>
            <label className="field date-field">
              <span className="field-label">날짜</span>
              <input
                className="input"
                type="date"
                value={form.date}
                min={goal.start_date}
                max={goal.end_date}
                onChange={(e) => e.target.value && set({ date: e.target.value })}
              />
            </label>
          </div>

          {isExpense ? (
            <label className="switch-row">
              <span>
                <b>예상 못 한 지출이에요</b>
                <small>병원비·경조사처럼 갑자기 생긴 지출은 남은 기간에 나눠서 조정해 드려요</small>
              </span>
              <input
                type="checkbox"
                className="switch"
                checked={form.is_unexpected}
                onChange={(e) => set({ is_unexpected: e.target.checked })}
              />
            </label>
          ) : (
            <p className="hint">월급은 목표를 정할 때 자동으로 들어가 있어요. 그 밖의 수입만 기록하세요.</p>
          )}

          {error && <div className="alert error">{error}</div>}
          <button className="btn primary block" disabled={saving}>
            {saving ? (form.is_unexpected ? '예산 조정하는 중…' : '저장하는 중…') : `${isExpense ? '지출' : '수입'} 기록하기`}
          </button>
        </form>

        <QuickInput onDone={onRecordsSaved} />
      </div>

      <div className="ledger-col">
        {recalc && <RecalcCard recalc={recalc} onClose={() => setRecalc(null)} />}

        <section className="card day-card">
          <DateNav date={listDate} min={goal.start_date} max={goal.end_date} onChange={setListDate} />
          <div className="day-totals">
            <div>
              <span>지출</span>
              <b>{won(spentTotal)}</b>
            </div>
            <div>
              <span>수입</span>
              <b className={incomeTotal ? 'pos' : ''}>{won(incomeTotal)}</b>
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="empty">이 날은 기록이 없어요.</p>
          ) : (
            <ul className="tx-list">
              {rows.map((x) => (
                <li key={`${x.type}${x.id}`}>
                  <CategoryIcon category={x.category} income={x.type === 'income'} />
                  <div className="tx-body">
                    <b>{x.memo || (x.type === 'income' ? '수입' : x.category)}</b>
                    <span>
                      {x.type === 'income' ? '수입' : x.category}
                      {x.is_planned && <em className="tag">예정</em>}
                      {x.is_unexpected && <em className="tag warn">돌발</em>}
                    </span>
                  </div>
                  <b className={`tx-amount ${x.type === 'income' ? 'pos' : ''}`}>
                    {x.type === 'income' ? '+' : '-'}
                    {won(x.amount)}
                  </b>
                  <button className="icon-btn danger" onClick={() => remove(x.type, x.id)} aria-label="삭제" title="삭제">
                    <Trash2 size={16} />
                  </button>
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
  const up = plan.after >= plan.before;

  const title = isBulk
    ? `${plan.count}건을 기록했어요`
    : isIncome
      ? '수입을 반영했어요'
      : advice
        ? '갑작스러운 지출을 나눠서 조정했어요'
        : '하루 한도를 다시 계산했어요';

  const detail = isBulk
    ? `지출 ${koreanWon(plan.expenseTotal)}${plan.incomeTotal > 0 ? `, 수입 ${koreanWon(plan.incomeTotal)}` : ''}을 반영했어요.`
    : isIncome
      ? `${koreanWon(plan.amount)} 덕분에 하루 ${won(plan.diffPerDay)}씩 더 쓸 수 있어요.`
      : advice
        ? `${koreanWon(plan.amount)}을 남은 ${plan.daysLeft}일에 나눴어요.`
        : plan.diffPerDay > 0
          ? `한도를 넘은 만큼 남은 기간에 나눠, 하루 ${won(plan.diffPerDay)}씩 줄었어요.`
          : plan.diffPerDay < 0
            ? `한도 안에서 썼어요. 아낀 돈으로 하루 ${won(-plan.diffPerDay)}씩 늘었어요.`
            : '딱 한도만큼 썼어요.';

  return (
    <section className={`card recalc ${up ? 'up' : 'down'}`}>
      <div className="recalc-head">
        <h3>{title}</h3>
        <button className="icon-btn" onClick={onClose} aria-label="닫기">
          <X size={18} />
        </button>
      </div>

      {plan.daysLeft > 0 ? (
        <div className="recalc-numbers">
          <div>
            <span>{isIncome ? '지금까지' : '전'}</span>
            <b>{won(plan.before)}</b>
          </div>
          <ArrowRight size={18} className="muted" />
          <div>
            <span>
              {isIncome ? '오늘부터' : '내일부터'} {plan.daysLeft}일
            </span>
            <b className={up ? 'pos' : 'neg'}>{won(plan.after)}</b>
          </div>
        </div>
      ) : (
        <p className="hint">목표 기간의 마지막 날이라 나눌 날이 남지 않았어요.</p>
      )}
      <p className="recalc-detail">
        {detail} 남은 예산은 <b>{won(plan.remainingBudget)}</b>이에요.
      </p>

      {advice && (
        <div className="advice">
          <div className="advice-head">
            <AiTag label="AI 조언" />
          </div>
          <p>{advice.message}</p>
          <ul>
            {advice.actions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
