import {
  Bus,
  ChevronLeft,
  ChevronRight,
  Coffee,
  House,
  Package,
  Pill,
  ShoppingBag,
  Sparkles,
  Ticket,
  Utensils,
  Wallet,
} from 'lucide-react';
import { todayStr } from '../api.js';

export const CATEGORIES = ['식비', '카페/간식', '교통', '쇼핑', '문화/여가', '생활', '의료', '기타'];

// 카테고리마다 아이콘과 색 (색은 CSS의 .tone-* 클래스)
const CATEGORY_META = {
  식비: { Icon: Utensils, tone: 'orange' },
  '카페/간식': { Icon: Coffee, tone: 'amber' },
  교통: { Icon: Bus, tone: 'blue' },
  쇼핑: { Icon: ShoppingBag, tone: 'pink' },
  '문화/여가': { Icon: Ticket, tone: 'violet' },
  생활: { Icon: House, tone: 'teal' },
  의료: { Icon: Pill, tone: 'red' },
  기타: { Icon: Package, tone: 'gray' },
};

export const toneOf = (category) => (CATEGORY_META[category] || CATEGORY_META.기타).tone;

export function CategoryIcon({ category, income = false, size = 18 }) {
  const { Icon, tone } = income ? { Icon: Wallet, tone: 'green' } : CATEGORY_META[category] || CATEGORY_META.기타;
  return (
    <span className={`cat-icon tone-${tone}`} aria-hidden="true">
      <Icon size={size} strokeWidth={2} />
    </span>
  );
}

/** AI가 만든 내용이라는 작은 표시 */
export function AiTag({ label = 'AI' }) {
  return (
    <span className="ai-tag">
      <Sparkles size={12} strokeWidth={2.2} />
      {label}
    </span>
  );
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 2026-11-17 → 11월 17일 (월) */
export function formatDate(date, withWeekday = true) {
  const [y, m, d] = date.split('-').map(Number);
  const w = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일${withWeekday ? ` (${w})` : ''}`;
}

export function shiftDate(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** ‹ 11월 17일 (월) · 오늘 ›  가운데를 누르면 달력이 열림 */
export function DateNav({ date, min, max, onChange }) {
  const today = todayStr();
  const label = date === today ? '오늘' : date === shiftDate(today, -1) ? '어제' : null;
  return (
    <div className="date-nav">
      <button
        type="button"
        className="icon-btn"
        onClick={() => onChange(shiftDate(date, -1))}
        disabled={min && date <= min}
        aria-label="이전 날"
      >
        <ChevronLeft size={18} />
      </button>
      <label className="date-nav-label">
        <span>
          {formatDate(date)}
          {label && <em>{label}</em>}
        </span>
        <input
          type="date"
          value={date}
          min={min}
          max={max}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          onClick={(e) => {
            try {
              e.currentTarget.showPicker?.();
            } catch {
              /* 지원하지 않는 브라우저는 기본 동작 */
            }
          }}
          aria-label="날짜 선택"
        />
      </label>
      <button
        type="button"
        className="icon-btn"
        onClick={() => onChange(shiftDate(date, 1))}
        disabled={max && date >= max}
        aria-label="다음 날"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

/** 돼지 저금통 로고 (단색 SVG) */
export function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo-mark">
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <path
        d="M9 17.5c0-3.6 3.1-6.5 7.2-6.5 1.6 0 3 .4 4.2 1.1l2.1-1.3-.4 2.6c.9 1 1.5 2.3 1.6 3.6l1.3.4v2.4l-1.6.4c-.5 1.2-1.4 2.2-2.5 2.9V25h-2.3l-.4-1.4c-.6.1-1.2.2-1.9.2s-1.3-.1-1.9-.2L14 25h-2.3v-2.6C10.1 21.3 9 19.5 9 17.5Z"
        fill="#fff"
      />
      <circle cx="20.2" cy="16.3" r="1" fill="currentColor" />
      <path d="M14.2 13.4h3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
