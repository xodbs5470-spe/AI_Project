import { koreanWon } from '../api.js';

const MAX = 2_000_000_000;

/**
 * 금액 입력칸: 입력하는 동안 쉼표를 넣고, 아래에 '20만원'처럼 읽기 쉬운 금액을 보여준다.
 * value: number | '' , onChange(number | '')
 */
export default function MoneyInput({ value, onChange, placeholder, required, quick }) {
  const display = value === '' || value == null ? '' : Number(value).toLocaleString('ko-KR');

  function handle(e) {
    const digits = e.target.value.replace(/[^0-9]/g, '');
    onChange(digits === '' ? '' : Math.min(Number(digits), MAX));
  }

  return (
    <div className="money">
      <div className="money-box">
        <input
          inputMode="numeric"
          autoComplete="off"
          value={display}
          onChange={handle}
          placeholder={placeholder}
          required={required}
        />
        <span className="unit">원</span>
      </div>
      <div className="money-foot">
        <span className="money-hint">{value !== '' && value != null ? koreanWon(value) : ' '}</span>
        {quick && (
          <span className="quick">
            {quick.map((q) => (
              <button type="button" key={q} onClick={() => onChange(Math.min((Number(value) || 0) + q, MAX))}>
                +{koreanWon(q).replace('원', '')}
              </button>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
