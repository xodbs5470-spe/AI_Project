import { useState } from 'react';
import { Camera, ReceiptText } from 'lucide-react';
import { api, koreanWon } from '../api.js';
import PreviewList, { toRecord } from './PreviewList.jsx';
import { AiTag } from './ui.jsx';

const SAMPLE = `[신한카드] 승인 홍*동 6,500원 11/13 14:22 스타벅스
[KB국민체크] 홍*동님 4,000원 승인 11/13 12:05 김밥천국 누적 120,000원
[카카오뱅크] 입금 50,000원 11/13 09:00 용돈
퇴근길 택시 1만 2천원`;

const PLACEHOLDER = '[신한카드] 승인 6,500원 스타벅스\n또는: 점심 김밥 4천원이랑 커피 4500원';

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

  function reset() {
    setPreview(null);
    setPhoto(null);
  }

  async function save() {
    const chosen = preview.items.filter((i) => i.selected);
    setSaving(true);
    setError('');
    try {
      const res = await api.bulk(chosen.map(toRecord));
      reset();
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
    <section className="card quick-input">
      <div className="card-title">
        <ReceiptText size={18} />
        <h3>문자·영수증으로 한 번에</h3>
        <AiTag />
      </div>

      {!preview ? (
        <>
          <p className="hint">카드 결제 문자를 여러 개 붙여 넣거나 영수증 사진을 올리면, 알아서 나눠서 정리해 드려요.</p>
          <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={PLACEHOLDER} />
          <div className="actions">
            <button type="button" className="btn text" onClick={() => setText(SAMPLE)}>
              예시 넣기
            </button>
            <span className="spacer" />
            <label className={`btn subtle ${loading ? 'disabled' : ''}`}>
              <Camera size={16} />
              {loading === 'photo' ? '읽는 중…' : '영수증 사진'}
              <input type="file" accept="image/*" onChange={analyzePhoto} disabled={Boolean(loading)} hidden />
            </label>
            <button type="button" className="btn primary" onClick={analyze} disabled={Boolean(loading) || !text.trim()}>
              {loading === 'text' ? '읽는 중…' : '읽어오기'}
            </button>
          </div>
          {loading === 'photo' && photo && <img className="receipt-thumb" src={photo} alt="올린 영수증" />}
        </>
      ) : (
        <>
          {photo && <img className="receipt-thumb" src={photo} alt="올린 영수증" />}
          <p className="hint">
            <b>{preview.items.length}건</b>을 찾았어요. 틀린 부분은 고친 뒤 등록하세요.
          </p>

          <PreviewList items={preview.items} onUpdate={update} />

          {preview.ignored.length > 0 && (
            <details className="ignored">
              <summary>건너뛴 내용 {preview.ignored.length}건</summary>
              <ul>
                {preview.ignored.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="actions">
            <button type="button" className="btn text" onClick={reset}>
              다시 입력
            </button>
            <span className="spacer" />
            <button type="button" className="btn primary" onClick={save} disabled={saving || chosen.length === 0}>
              {saving ? '등록하는 중…' : `${chosen.length}건 등록 (${net >= 0 ? '+' : ''}${koreanWon(net)})`}
            </button>
          </div>
        </>
      )}

      {error && <div className="alert error">{error}</div>}
    </section>
  );
}
