import { useState } from 'react';
import { api, koreanWon, paydaysBetween, todayStr, won } from '../api.js';
import MoneyInput from './MoneyInput.jsx';

function defaultEnd() {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const num = (v) => Number(v) || 0;

export default function GoalForm({ current, onSaved }) {
  const [form, setForm] = useState({
    title: current?.title ?? '',
    target_amount: current?.target_amount ?? '',
    current_assets: current?.current_assets ?? '',
    monthly_income: current?.monthly_income || '',
    income_day: current?.income_day ?? 25,
    fixed_costs: current?.fixed_costs ?? '',
    start_date: todayStr(),
    end_date: current?.end_date && current.end_date > todayStr() ? current.end_date : defaultEnd(),
    lunch_ratio: Math.round((current?.lunch_ratio ?? 0.4) * 100),
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const setValue = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const setEvent = (key) => (e) => setValue(key)(e.target.value);

  const hasIncome = num(form.monthly_income) > 0;
  const paydays = hasIncome ? paydaysBetween(form.start_date, form.end_date, num(form.income_day)) : [];
  const expectedIncome = paydays.length * num(form.monthly_income);
  const spendable =
    num(form.current_assets) + expectedIncome - num(form.target_amount) - num(form.fixed_costs);
  const days =
    form.start_date && form.end_date && form.end_date >= form.start_date
      ? Math.round((Date.parse(form.end_date) - Date.parse(form.start_date)) / 86400000) + 1
      : 0;
  const perDay = days > 0 ? Math.floor(spendable / days / 100) * 100 : 0;

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.saveGoal({
        title: form.title,
        target_amount: num(form.target_amount),
        current_assets: num(form.current_assets),
        monthly_income: num(form.monthly_income),
        income_day: hasIncome ? num(form.income_day) : null,
        fixed_costs: num(form.fixed_costs),
        start_date: form.start_date,
        end_date: form.end_date,
        lunch_ratio: Number(form.lunch_ratio) / 100,
      });
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card form goal-form" onSubmit={submit}>
      <h2>{current ? '새 목표로 다시 시작' : '저축 목표를 정해 볼까요?'}</h2>
      {current && (
        <p className="muted small">
          새 목표를 저장하면 현재 목표({current.title})는 종료되고 오늘부터 다시 계산돼요.
        </p>
      )}

      <label>
        목표 이름
        <input value={form.title} onChange={setEvent('title')} placeholder="예: 노트북 사기, 여행 자금" required />
      </label>

      <div className="row">
        <label>
          모을 금액
          <MoneyInput value={form.target_amount} onChange={setValue('target_amount')} placeholder="2,000,000" required />
        </label>
        <label>
          지금 가진 돈
          <MoneyInput value={form.current_assets} onChange={setValue('current_assets')} placeholder="500,000" required />
        </label>
      </div>

      <div className="row">
        <label>
          월 수입 (월급, 용돈, 알바비)
          <MoneyInput value={form.monthly_income} onChange={setValue('monthly_income')} placeholder="없으면 비워 두세요" />
        </label>
        <label>
          수입 들어오는 날
          <div className="money-box">
            <span className="unit pre">매월</span>
            <input
              type="number"
              min="1"
              max="31"
              value={form.income_day}
              onChange={setEvent('income_day')}
              disabled={!hasIncome}
            />
            <span className="unit">일</span>
          </div>
        </label>
      </div>

      <label>
        기간 내 고정 지출 합계 (월세, 통신비, 교통 정기권 등)
        <MoneyInput value={form.fixed_costs} onChange={setValue('fixed_costs')} placeholder="0" />
      </label>

      <div className="row">
        <label>
          시작일
          <input type="date" value={form.start_date} onChange={setEvent('start_date')} required />
        </label>
        <label>
          종료일
          <input type="date" value={form.end_date} onChange={setEvent('end_date')} required />
        </label>
      </div>

      <label>
        하루 예산 중 점심 비율: <b>{form.lunch_ratio}%</b>
        <input type="range" min="10" max="80" step="5" value={form.lunch_ratio} onChange={setEvent('lunch_ratio')} />
      </label>

      <div className={`preview ${spendable < 0 ? 'bad' : ''}`}>
        <div className="calc">
          <span>지금 가진 돈</span>
          <b>{koreanWon(num(form.current_assets))}</b>
          <span>+ 기간 내 수입 {paydays.length > 0 && `(${paydays.length}회)`}</span>
          <b>{koreanWon(expectedIncome)}</b>
          <span>− 모을 금액</span>
          <b>{koreanWon(num(form.target_amount))}</b>
          <span>− 고정 지출</span>
          <b>{koreanWon(num(form.fixed_costs))}</b>
          <span className="total">= 쓸 수 있는 돈</span>
          <b className="total">{koreanWon(spendable)}</b>
        </div>
        {spendable < 0 ? (
          <p>
            <b>{koreanWon(-spendable)}</b>이 부족해요. 기간을 늘리거나, 수입을 추가하거나, 목표 금액을 줄여 보세요.
          </p>
        ) : (
          days > 0 && (
            <p>
              {days}일 동안 하루 약 <b>{won(perDay)}</b>씩 쓸 수 있어요.
            </p>
          )
        )}
      </div>

      {error && <div className="alert error">{error}</div>}
      <button className="primary" disabled={saving || spendable < 0}>
        {saving ? '저장 중...' : '목표 저장하고 시작하기'}
      </button>
    </form>
  );
}
