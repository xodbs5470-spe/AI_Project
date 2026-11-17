import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Link, RefreshCw, Smartphone } from 'lucide-react';
import { api, timeAgo } from '../api.js';

const LOCAL = ['localhost', '127.0.0.1', '::1', '[::1]'];

/** 아이폰 단축어로 결제 문자를 보내는 연결 설정 */
export default function SmsSettings() {
  const [settings, setSettings] = useState(null);
  const [host, setHost] = useState('');
  const [copied, setCopied] = useState(false);
  const [ping, setPing] = useState(null);
  const [error, setError] = useState('');
  const urlRef = useRef(null);

  useEffect(() => {
    api
      .smsSettings()
      .then((s) => {
        setSettings(s);
        setHost(s.lanAddresses[0] || '');
      })
      .catch((e) => setError(e.message));
  }, []);

  if (!settings) return error ? <div className="alert error">{error}</div> : null;

  // PC에서 localhost로 열었으면 폰이 접속할 수 있는 와이파이 주소로 바꿔서 보여준다
  const onLocal = LOCAL.includes(window.location.hostname);
  const port = window.location.port ? `:${window.location.port}` : '';
  const origin = onLocal ? (host ? `http://${host}${port}` : '') : window.location.origin;
  const url = origin ? `${origin}/api/sms/webhook?token=${settings.token}` : '';

  async function setMode(mode) {
    setError('');
    try {
      await api.setSmsMode(mode);
      setSettings((s) => ({ ...s, mode }));
    } catch (e) {
      setError(e.message);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // http 주소(폰 접속)에서는 clipboard API가 막혀 있어서 선택 후 복사로 대신
      urlRef.current?.select();
      document.execCommand?.('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function rotate() {
    if (!window.confirm('주소를 새로 만들면 지금 단축어는 더 이상 동작하지 않아요. 새로 만들까요?')) return;
    try {
      const { token } = await api.rotateSmsToken();
      setSettings((s) => ({ ...s, token }));
      setPing(null);
    } catch (e) {
      setError(e.message);
    }
  }

  async function test() {
    setPing(await api.smsPing(settings.token).catch((e) => ({ ok: false, text: e.message })));
  }

  return (
    <section className="card sms-settings">
      <div className="card-title">
        <Smartphone size={18} />
        <h3>결제 문자 자동 입력 (아이폰)</h3>
        <span className="spacer" />
        <span className="meta">{settings.lastReceivedAt ? `마지막 수신 ${timeAgo(settings.lastReceivedAt)}` : '아직 연결 전'}</span>
      </div>
      <p className="hint">카드 결제 문자가 오면 아이폰이 저금이돈으로 보내고, 금액·가게·카테고리를 알아서 기록해요.</p>

      <div className="field">
        <span className="field-label">받은 결제는</span>
        <div className="segment">
          <button type="button" className={settings.mode === 'inbox' ? 'active' : ''} onClick={() => setMode('inbox')}>
            확인하고 기록
          </button>
          <button type="button" className={settings.mode === 'auto' ? 'active' : ''} onClick={() => setMode('auto')}>
            바로 기록
          </button>
        </div>
        <p className="hint">
          {settings.mode === 'inbox'
            ? '가계부 탭에 모아 두고, 내가 확인한 뒤 기록해요.'
            : '오는 즉시 기록하고 한도를 다시 계산해요. 중복 같은 결제만 따로 모아 둬요.'}
        </p>
      </div>

      <div className="field">
        <span className="field-label">단축어에 넣을 주소</span>
        {onLocal && settings.lanAddresses.length > 1 && (
          <select className="input" value={host} onChange={(e) => setHost(e.target.value)}>
            {settings.lanAddresses.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        )}
        {url ? (
          <div className="url-row">
            <input className="input mono" ref={urlRef} readOnly value={url} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn subtle" onClick={copy}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? '복사됨' : '복사'}
            </button>
          </div>
        ) : (
          <div className="alert error">이 PC의 와이파이 주소를 찾지 못했어요. PC가 네트워크에 연결돼 있는지 확인해 주세요.</div>
        )}
        <div className="url-actions">
          <button type="button" className="btn text small" onClick={test}>
            <Link size={14} /> 연결 확인
          </button>
          <button type="button" className="btn text small" onClick={rotate}>
            <RefreshCw size={14} /> 주소 새로 만들기
          </button>
        </div>
        {ping && <div className={`alert ${ping.ok ? 'ok' : 'error'}`}>{ping.text}</div>}
      </div>

      <details className="guide" open={!settings.lastReceivedAt}>
        <summary>아이폰 단축어 설정하기 (iOS 17 이상)</summary>
        <ol className="steps">
          <li>
            아이폰과 이 PC를 <b>같은 와이파이</b>에 연결하고, 아이폰 Safari로 위 주소를 열어 <b>"연결 성공"</b>이 뜨는지
            확인해요. 폰에서 저금이돈을 열면 이 화면에서 바로 복사할 수 있어요.
          </li>
          <li>
            <b>단축어</b> 앱 → <b>자동화</b> 탭 → <b>+</b> → <b>메시지</b>
          </li>
          <li>
            <b>메시지에 포함</b>에 <code>승인</code> 입력 → <b>즉시 실행</b> → 다음 → <b>새로운 빈 자동화</b>
          </li>
          <li>
            <b>URL 내용 가져오기</b> 동작을 추가하고 URL에 위 주소를 붙여 넣어요.
          </li>
          <li>
            <b>›</b>를 눌러 펼친 뒤 방법 <b>POST</b>, 요청 본문 <b>JSON</b> → 필드 추가(<b>텍스트</b>) → 키 <code>text</code>, 값은{' '}
            <b>단축어 입력</b>을 넣고 눌러서 <b>내용</b>으로 바꿔요.
          </li>
          <li>
            (선택) <b>알림 보기</b>를 추가하고 <b>URL의 내용</b>을 넣으면 기록 결과가 알림으로 떠요. 입금 문자도 받으려면{' '}
            <code>입금</code>으로 하나 더 만들어요.
          </li>
        </ol>
        <ul className="notes">
          <li>PC에서 저금이돈이 켜져 있고, 폰이 같은 와이파이에 있을 때만 전송돼요.</li>
          <li>토스·카카오페이처럼 앱 알림으로만 오는 결제는 아이폰에서 읽을 수 없어요.</li>
          <li>주소에는 비밀 토큰이 들어 있어요. 남에게 알려 줬다면 "주소 새로 만들기"를 눌러 주세요.</li>
        </ul>
      </details>

      {error && <div className="alert error">{error}</div>}
    </section>
  );
}
