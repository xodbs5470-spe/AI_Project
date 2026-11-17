import { useState } from 'react';
import { PencilLine, Target } from 'lucide-react';
import { koreanWon } from '../api.js';
import GoalForm from './GoalForm.jsx';
import SmsSettings from './SmsSettings.jsx';
import { formatDate } from './ui.jsx';

export default function SettingsPanel({ goal, onSaved }) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="settings">
      {editing ? (
        <GoalForm current={goal} onSaved={onSaved} onCancel={() => setEditing(false)} />
      ) : (
        <section className="card goal-summary">
          <div className="card-title">
            <Target size={18} />
            <h3>진행 중인 목표</h3>
          </div>
          <div className="goal-summary-main">
            <span>{goal.title}</span>
            <b>{koreanWon(goal.target_amount)} 모으기</b>
          </div>
          <dl className="kv">
            <div>
              <dt>기간</dt>
              <dd>
                {formatDate(goal.start_date, false)} ~ {formatDate(goal.end_date, false)}
              </dd>
            </div>
            <div>
              <dt>시작할 때 가진 돈</dt>
              <dd>{koreanWon(goal.current_assets)}</dd>
            </div>
            <div>
              <dt>월 수입</dt>
              <dd>{goal.monthly_income > 0 ? `${koreanWon(goal.monthly_income)} · 매월 ${goal.income_day}일` : '없음'}</dd>
            </div>
            <div>
              <dt>고정 지출</dt>
              <dd>{koreanWon(goal.fixed_costs)}</dd>
            </div>
            <div>
              <dt>점심 비율</dt>
              <dd>하루 예산의 {Math.round(goal.lunch_ratio * 100)}%</dd>
            </div>
          </dl>
          <button className="btn subtle block" onClick={() => setEditing(true)}>
            <PencilLine size={16} />
            목표 바꾸기
          </button>
        </section>
      )}

      <SmsSettings />
    </div>
  );
}
