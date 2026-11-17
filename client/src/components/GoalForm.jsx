import { useState } from 'react';
import { api, koreanWon, paydaysBetween, todayStr, won } from '../api.js';
import MoneyInput from './MoneyInput.jsx';

function defaultEnd() {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const num = (v) => Number(v) || 0;

export default function GoalForm({ current, onSaved, onCancel }) {
  const [form, setForm] = useState({
    title: current?.title ?? '',
    target_amount: current?.target_amount ?? '',
    current_assets: current?.current_assets ?? '',
    monthly_income: current?.monthly_income || '',
    income_day: current?.income_day ?? 25,
    fixed_costs: current?.fixed_costs || '',
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
  const spendable = num(form.current_assets) + expectedIncome - num(form.target_amount) - num(form.fixed_costs);
  const days =
    form.start_date && form.end_date && form.end_date >= form.start_date
      ? Math.round((Date.parse(form.end_date) - Date.parse(form.start_date)) / 86400000) + 1
      : 0;
  const perDay = days > 0 ? Math.floor(spendable / days / 100) * 100 : 0;
  const filled = num(form.target_amount) > 0 && form.current_assets !== '';

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
    <form className="card goal-form" onSubmit={submit}>
      {current && (
        <div className="form-head">
          <h3>새 목표로 다시 시작</h3>
          <p className="hint">저장하면 지금 목표({current.title})는 끝나고, 오늘부터 새로 계산해요.</p>
        </div>
      )}

      <fieldset>
        <legend>무엇을 위해 모으나요?</legend>
        <label className="field">
          <span className="field-label">목표 이름</span>
          <input className="input" value={form.title} onChange={setEvent('title')} placeholder="노트북 사기, 여행 자금" required />
        </label>
        <div className="field-grid">
          <label className="field">
            <span className="field-label">모을 금액</span>
            <MoneyInput value={form.target_amount} onChange={setValue('target_amount')} placeholder="2,000,000" required />
          </label>
          <label className="field">
            <span className="field-label">지금 가진 돈</span>
            <MoneyInput value={form.current_assets} onChange={setValue('current_assets')} placeholder="500,000" required />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>들어오고 나가는 돈</legend>
        <div className="field-grid">
          <label className="field">
            <span className="field-label">월 수입 (월급·용돈·알바비)</span>
            <MoneyInput value={form.monthly_income} onChange={setValue('monthly_income')} placeholder="없으면 비워 두세요" />
          </label>
          <label className="field">
            <span className="field-label">들어오는 날</span>
            <div className={`money-box ${hasIncome ? '' : 'disabled'}`}>
              <span className="unit pre">매월</span>
              <input type="number" min="1" max="31" value={form.income_day} onChange={setEvent('income_day')} disabled={!hasIncome} />
              <span className="unit">일</span>
            </div>
          </label>
        </div>
        <label className="field">
          <span className="field-label">기간 동안 꼭 나가는 돈 (월세·통신비·정기권)</span>
          <MoneyInput value={form.fixed_costs} onChange={setValue('fixed_costs')} placeholder="0" />
        </label>
      </fieldset>

      <fieldset>
        <legend>언제까지 모을까요?</legend>
        <div className="field-grid">
          <label className="field">
            <span className="field-label">시작</span>
            <input className="input" type="date" value={form.start_date} onChange={setEvent('start_date')} required />
          </label>
          <label className="field">
            <span className="field-label">끝</span>
            <input className="input" type="date" value={form.end_date} onChange={setEvent('end_date')} required />
          </label>
        </div>
        <label className="field">
          <span className="field-label">
            하루 예산 중 점심에 쓸 비율 <b>{form.lunch_ratio}%</b>
          </span>
          <input className="range" type="range" min="10" max="80" step="5" value={form.lunch_ratio} onChange={setEvent('lunch_ratio')} />
        </label>
      </fieldset>

      <div className={`calc-box ${spendable < 0 ? 'bad' : ''}`}>
        {filled && days > 0 && spendable >= 0 && (
          <div className="calc-result">
            <span>하루에 쓸 수 있는 돈</span>
            <b>{won(perDay)}</b>
          </div>
        )}
        <dl className="calc">
          <dt>지금 가진 돈</dt>
          <dd>{koreanWon(num(form.current_assets))}</dd>
          <dt>+ 기간 내 수입{paydays.length > 0 && ` (${paydays.length}번)`}</dt>
          <dd>{koreanWon(expectedIncome)}</dd>
          <dt>− 모을 금액</dt>
          <dd>{koreanWon(num(form.target_amount))}</dd>
          <dt>− 꼭 나가는 돈</dt>
          <dd>{koreanWon(num(form.fixed_costs))}</dd>
          <dt className="total">= {days > 0 ? `${days}일 동안 ` : ''}쓸 수 있는 돈</dt>
          <dd className="total">{koreanWon(spendable)}</dd>
        </dl>
        {spendable < 0 && (
          <p className="calc-warn">
            <b>{koreanWon(-spendable)}</b>이 모자라요. 기간을 늘리거나, 수입을 넣거나, 모을 금액을 줄여 보세요.
          </p>
        )}
      </div>

      {error && <div className="alert error">{error}</div>}
      <div className="actions">
        {onCancel && (
          <button type="button" className="btn text" onClick={onCancel}>
            취소
          </button>
        )}
        <span className="spacer" />
        <button className="btn primary" disabled={saving || spendable < 0}>
          {saving ? '저장하는 중…' : current ? '새 목표로 시작하기' : '시작하기'}
        </button>
      </div>
    </form>
  );
}
