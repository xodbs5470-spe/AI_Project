# 저금이돈 (AI 지출 관리 & 절약 코칭) — 작업 규칙

학교 과제. 핵심 평가 포인트는 **생성형 AI 활용**. 사용자 설명은 README.md 참고.

## 명령
- 설치: `npm run setup` (루트) — npm 11은 install script를 막지만 embedded-postgres는 그대로 동작함
- 개발: `npm run dev` → server :4000 (node --watch), client :5173 (Vite, `host: true`라 폰에서 `http://<PC IP>:5173` 접속)
- 테스트: `npm test` (node --test, server/test/*.test.js)
- 빌드: `npm run build` → client/dist (server가 정적 서빙)

## 구조
- client/: React 19 + Vite, Recharts. 화면은 components/*.jsx, API 호출은 src/api.js
- server/: Express 5 (ESM). routes.js(REST), data.js(조회), db.js(내장 PostgreSQL), schema.sql(멱등 마이그레이션)
- server/src/services/: budget.js(계산, 순수 함수) · ai.js(OpenAI/Gemini, 자동 전환, 이미지, function calling 루프) · coach.js(프롬프트·스키마·규칙 기반 대체) · parser.js(문자/영수증 해석) · assistant.js(챗봇 도구)

## 원칙
- **계산은 코드, 해석은 AI**: 금액·한도는 budget.js에서 계산하고 AI에는 결과만 넘긴다. 계산을 바꾸면 budget.test.js에 테스트 추가.
- 모든 AI 기능은 키가 없을 때의 규칙 기반 대체 응답(provider `rule`)을 유지한다.
- AI 응답은 JSON 스키마(strict)로 받고 서버에서 다시 검증한다 (예: 예산 초과 메뉴 제거, 목표 못 지키는 구매는 buy 금지).
- UI 문구는 한국어 해요체. 금액 표시는 api.js의 `won` / `koreanWon` 사용.
- Recharts SVG 색은 CSS 변수 대신 리터럴 값, `isAnimationActive={false}`.

## 테스트 시 주의
- **실제 OpenAI 키로 호출하지 않는다** (요금). 사용자의 개발 서버(:4000/:5173/:54329)는 건드리지 않는다.
- 격리 서버: `PORT=4100 EMBEDDED_PG_PORT=54330 EMBEDDED_PG_DIR=<임시폴더> OPENAI_API_KEY= GEMINI_API_KEY= node server/src/index.js`
- AI 경로 확인은 가짜 OpenAI 서버 + `OPENAI_BASE_URL=http://localhost:<port>/v1`, `OPENAI_API_KEY=mock`.
- UI 변경은 빌드 후 데스크톱·모바일(390px) 화면을 렌더링해서 확인하고 넘긴다.
- 테스트용 서버·DB 폴더는 끝나면 정리한다.

## Git
- 커밋·푸시는 사용자가 확인한 뒤에만. `.env`(API 키), `.pgdata/`는 절대 커밋하지 않는다.
