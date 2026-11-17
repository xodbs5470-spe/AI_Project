import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const { default: express } = await import('express');
const { initDb, closeDb } = await import('./db.js');
const { router } = await import('./routes.js');
const { smsRouter } = await import('./sms.js');
const { configuredProviders } = await import('./services/ai.js');

const app = express();
// 영수증 사진은 base64로 오므로 이 경로만 크기 제한을 늘림
app.use('/api/parse-image', express.json({ limit: '8mb' }));
// 아이폰 단축어가 본문을 일반 텍스트로 보내는 경우도 받기
app.use('/api/sms/webhook', express.text({ type: 'text/*', limit: '20kb' }));
app.use(express.json({ limit: '100kb' }));
app.use('/api/sms', smsRouter);
app.use('/api', router);

// 배포용: client/dist가 있으면 정적 파일도 같이 서빙
const dist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(dist));
app.get(/^\/(?!api).*/, (_req, res, next) =>
  res.sendFile(path.join(dist, 'index.html'), (err) => err && next()),
);

// Express 5는 async 핸들러 에러를 여기로 넘겨준다
app.use((err, _req, res, _next) => {
  const badJson = err.type === 'entity.parse.failed';
  const status = badJson ? 400 : err.status || 500;
  if (status >= 500) console.error(err);
  const message = badJson
    ? '요청 형식(JSON)이 올바르지 않아요.'
    : status >= 500
      ? '서버 오류가 발생했어요.'
      : err.message;
  res.status(status).json({ error: message });
});

await initDb();

const port = Number(process.env.PORT || 4000);
const server = app.listen(port, () => {
  const ai = configuredProviders();
  console.log(`[server] http://localhost:${port}`);
  console.log(
    `[ai] 메인: ${process.env.AI_PROVIDER || 'openai'}, 사용 가능: ${ai.length ? ai.join(', ') : '없음 (규칙 기반 응답 사용)'}`,
  );
});

async function shutdown() {
  server.close();
  await closeDb();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
