-- 저금이돈 DB 스키마 (서버 시작 시 자동 적용, 여러 번 실행해도 안전)

CREATE TABLE IF NOT EXISTS goals (
  id             SERIAL PRIMARY KEY,
  title          TEXT        NOT NULL,
  target_amount  INTEGER     NOT NULL CHECK (target_amount >= 0),   -- 모을 목표 금액
  current_assets INTEGER     NOT NULL CHECK (current_assets >= 0),  -- 시작 시점 보유 자산 (목표 금액보다 적어도 됨)
  fixed_costs    INTEGER     NOT NULL DEFAULT 0 CHECK (fixed_costs >= 0), -- 기간 내 고정 지출 합계(월세, 통신비 등)
  start_date     DATE        NOT NULL,
  end_date       DATE        NOT NULL,
  lunch_ratio    NUMERIC(3,2) NOT NULL DEFAULT 0.40 CHECK (lunch_ratio > 0 AND lunch_ratio <= 1),
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

-- 수입 설정 (기존 DB에도 안전하게 추가)
ALTER TABLE goals ADD COLUMN IF NOT EXISTS monthly_income INTEGER NOT NULL DEFAULT 0;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS income_day INTEGER;   -- 매월 수입일(1~31), 없으면 NULL

-- 수입: 목표 설정 시 월급날 기준으로 '예정 수입'이 자동 생성되고, 추가 수입은 직접 기록
CREATE TABLE IF NOT EXISTS incomes (
  id          SERIAL PRIMARY KEY,
  goal_id     INTEGER     NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  received_on DATE        NOT NULL,
  amount      INTEGER     NOT NULL CHECK (amount > 0),
  memo        TEXT        NOT NULL DEFAULT '',
  is_planned  BOOLEAN     NOT NULL DEFAULT FALSE,  -- 월급 등 자동 생성된 예정 수입
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incomes_goal_date ON incomes (goal_id, received_on);

CREATE TABLE IF NOT EXISTS expenses (
  id            SERIAL PRIMARY KEY,
  goal_id       INTEGER     NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  spent_on      DATE        NOT NULL,
  amount        INTEGER     NOT NULL CHECK (amount > 0),
  category      TEXT        NOT NULL,
  memo          TEXT        NOT NULL DEFAULT '',
  is_unexpected BOOLEAN     NOT NULL DEFAULT FALSE,  -- 돌발 지출 여부
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_goal_date ON expenses (goal_id, spent_on);

CREATE TABLE IF NOT EXISTS daily_reports (
  goal_id     INTEGER     NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  report_date DATE        NOT NULL,
  score       INTEGER     NOT NULL,
  report      JSONB       NOT NULL,
  provider    TEXT        NOT NULL,   -- openai | gemini | rule(규칙 기반 대체)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (goal_id, report_date)
);
