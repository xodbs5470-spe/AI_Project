import { useState } from 'react';
import { api, koreanWon, PROVIDER_LABEL } from '../api.js';
import MoneyInput from './MoneyInput.jsx';

const CATEGORIES = ['식비', '카페/간식', '교통', '쇼핑', '문화/여가', '생활', '의료', '기타'];

const SAMPLE = `[신한카드] 승인 홍*동 6,500원 11/13 14:22 스타벅스
[KB국민체크] 홍*동님 4,000원 승인 11/13 12:05 김밥천국 누적 120,000원
[카카오뱅크] 입금 50,000원 11/13 09:00 용돈
퇴근길 택시 1만 2천원`;

/** 사진을 긴 변 1600px JPEG로 줄여서 data URL로 (업로드 용량·AI 비용 절약) */
function resizeImage(file, maxSide = 1600) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이 이미지를 열 수 없어요. JPG나 PNG로 올려 주세요.'));
    };
    img.src = url;
  });
}

/** 결제 알림 문자·문장·영수증 사진 → AI가 수입/지출로 나눠서 미리보기 → 확인 후 한 번에 등록 */
export default function QuickInput({ onDone }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null); // { items, ignored, provider }
  const [photo, setPhoto] = useState(null); // 미리보기용 data URL
  const [loading, setLoading] = useState(''); // '' | 'text' | 'photo'
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function analyzePhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLoading('photo');
    setError('');
    try {
      const dataUrl = await resizeImage(file);
      setPhoto(dataUrl);
      const res = await api.parseImage(dataUrl);
      if (res.items.length === 0)
        setError(res.ignored[0] || '영수증에서 금액을 찾지 못했어요. 더 밝고 선명하게 찍어 주세요.');
      setPreview(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading('');
    }
  }

  async function analyze() {
    setLoading('text');
    setError('');
    setPhoto(null);
    try {
      const res = await api.parse(text);
      if (res.items.length === 0) setError('거래를 찾지 못했어요. 금액이 들어간 문자나 문장인지 확인해 주세요.');
      setPreview(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading('');
    }
  }

  function update(idx, patch) {
    setPreview((p) => ({ ...p, items: p.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  }

  async function save() {
    const chosen = preview.items.filter((i) => i.selected);
    setSaving(true);
    setError('');
    try {
      const res = await api.bulk(
        chosen.map(({ type, amount, date, category, memo }) => ({ type, amount: Number(amount), date, category, memo })),
      );
      setPreview(null);
      setPhoto(null);
      setText('');
      onDone(res.recalculation);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const chosen = preview?.items.filter((i) => i.selected) ?? [];
  const net = chosen.reduce((a, i) => a + (i.type === 'income' ? 1 : -1) * (Number(i.amount) || 0), 0);

  return (
    <section className="card wide quick-input">
      <div className="card-head">
        <h3>✨ AI 빠른 입력</h3>
        <span className="muted small">결제 문자 · 입금 문자 · 문장 · 영수증 사진</span>
      </div>

      {!preview ? (
        <>
          <textarea
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'카드 결제 문자를 여러 개 한꺼번에 붙여 넣거나, 문장으로 적어 보세요.\n예) 점심 김밥 4천원이랑 커피 4500원'}
          />
          <div className="actions">
            <button type="button" className="link" onClick={() => setText(SAMPLE)}>
              예시 넣어 보기
            </button>
            <label className={`photo-btn ${loading ? 'disabled' : ''}`}>
              {loading === 'photo' ? '📷 AI가 영수증 읽는 중...' : '📷 영수증 사진'}
              <input type="file" accept="image/*" onChange={analyzePhoto} disabled={Boolean(loading)} hidden />
            </label>
            <button type="button" className="primary" onClick={analyze} disabled={Boolean(loading) || !text.trim()}>
              {loading === 'text' ? 'AI가 읽는 중...' : 'AI로 분석하기'}
            </button>
          </div>
          {loading === 'photo' && photo && <img className="receipt-thumb" src={photo} alt="올린 영수증" />}
        </>
      ) : (
        <>
          {photo && <img className="receipt-thumb" src={photo} alt="올린 영수증" />}
          <p className="small">
            <b>{preview.items.length}건</b>을 찾았어요. 확인하고 틀린 부분은 고친 뒤 등록하세요.{' '}
            <span className="provider inline">by {PROVIDER_LABEL[preview.provider]}</span>
          </p>

          <ul className="parsed">
            {preview.items.map((it, idx) => (
              <li key={idx} className={it.selected ? '' : 'off'}>
                <input
                  type="checkbox"
                  checked={it.selected}
                  onChange={(e) => update(idx, { selected: e.target.checked })}
                  aria-label="등록할지 선택"
                />
                <button
                  type="button"
                  className={`type-pill ${it.type}`}
                  onClick={() => update(idx, { type: it.type === 'income' ? 'expense' : 'income' })}
                  title="눌러서 수입/지출 바꾸기"
                >
                  {it.type === 'income' ? '수입' : '지출'}
                </button>
                <input
                  className="memo"
                  value={it.memo}
                  onChange={(e) => update(idx, { memo: e.target.value })}
                  placeholder="메모"
                />
                <div className="amount-cell">
                  <MoneyInput value={it.amount} onChange={(amount) => update(idx, { amount })} />
                </div>
                {it.type === 'expense' ? (
                  <select className="cat" value={it.category} onChange={(e) => update(idx, { category: e.target.value })}>
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
                  onChange={(e) => update(idx, { date: e.target.value })}
                />
                {(it.duplicate || !it.inPeriod) && (
                  <span className="warn-note">
                    {it.duplicate ? '⚠ 같은 날 같은 금액이 이미 기록돼 있어요 (중복?)' : '⚠ 목표 기간 밖의 날짜예요'}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {preview.ignored.length > 0 && (
            <details className="ignored">
              <summary>등록하지 않은 내용 {preview.ignored.length}건</summary>
              <ul>
                {preview.ignored.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="actions">
            <button
              type="button"
              className="link"
              onClick={() => {
                setPreview(null);
                setPhoto(null);
              }}
            >
              다시 입력
            </button>
            <button type="button" className="primary" onClick={save} disabled={saving || chosen.length === 0}>
              {saving
                ? '등록 중...'
                : `선택한 ${chosen.length}건 등록 (${net >= 0 ? '+' : ''}${koreanWon(net)})`}
            </button>
          </div>
        </>
      )}

      {error && <div className="alert error">{error}</div>}
    </section>
  );
}
