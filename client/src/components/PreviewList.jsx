import MoneyInput from './MoneyInput.jsx';

const CATEGORIES = ['식비', '카페/간식', '교통', '쇼핑', '문화/여가', '생활', '의료', '기타'];

/** AI가 해석한 수입/지출 미리보기 표 (빠른 입력, 영수증, 폰 문자 대기함이 같이 사용) */
export default function PreviewList({ items, onUpdate }) {
  return (
    <ul className="parsed">
      {items.map((it, idx) => (
        <li key={idx} className={it.selected ? '' : 'off'}>
          <input
            type="checkbox"
            checked={it.selected}
            onChange={(e) => onUpdate(idx, { selected: e.target.checked })}
            aria-label="등록할지 선택"
          />
          <button
            type="button"
            className={`type-pill ${it.type}`}
            onClick={() => onUpdate(idx, { type: it.type === 'income' ? 'expense' : 'income' })}
            title="눌러서 수입/지출 바꾸기"
          >
            {it.type === 'income' ? '수입' : '지출'}
          </button>
          <input
            className="memo"
            value={it.memo}
            onChange={(e) => onUpdate(idx, { memo: e.target.value })}
            placeholder="메모"
          />
          <div className="amount-cell">
            <MoneyInput value={it.amount} onChange={(amount) => onUpdate(idx, { amount })} />
          </div>
          {it.type === 'expense' ? (
            <select className="cat" value={it.category} onChange={(e) => onUpdate(idx, { category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          ) : (
            <span className="muted small center-text">-</span>
          )}
          <input
            className="date"
            type="date"
            value={it.date}
            onChange={(e) => onUpdate(idx, { date: e.target.value })}
          />
          {(it.duplicate || !it.inPeriod) && (
            <span className="warn-note">
              {it.duplicate ? '⚠ 같은 날 같은 금액이 이미 기록돼 있어요 (중복?)' : '⚠ 목표 기간 밖의 날짜예요'}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** 저장 API로 보낼 형태로 정리 */
export const toRecord = ({ type, amount, date, category, memo }) => ({
  type,
  amount: Number(amount),
  date,
  category,
  memo,
});
