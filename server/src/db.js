import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// DATE는 'YYYY-MM-DD' 문자열 그대로, 숫자형은 JS number로 받기
pg.types.setTypeParser(1082, (v) => v); // DATE
pg.types.setTypeParser(1700, (v) => Number(v)); // NUMERIC
pg.types.setTypeParser(20, (v) => Number(v)); // BIGINT (SUM 결과)

const DB_NAME = 'jeogeumido';
let pool;
let embedded;

async function canConnect(url) {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 1500 });
  try {
    await client.connect();
    return true;
  } catch (err) {
    return err.code === '3D000' ? 'no-database' : false;
  } finally {
    await client.end().catch(() => {});
  }
}

// DATABASE_URL이 없으면 프로젝트 폴더 안에서 PostgreSQL을 직접 띄운다 (설치 불필요)
async function startEmbeddedPostgres() {
  const port = Number(process.env.EMBEDDED_PG_PORT || 54329);
  const base = `postgres://postgres:postgres@localhost:${port}`;
  const url = `${base}/${DB_NAME}`;

  // 개발 중 서버 재시작(--watch) 시 이미 떠 있는 DB를 재사용
  const status = await canConnect(url);
  if (status === true) return url;

  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dataDir = process.env.EMBEDDED_PG_DIR || path.resolve(__dirname, '../../.pgdata');
  embedded = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: true,
    initdbFlags: ['--encoding=UTF8', '--no-locale'],
    onLog: () => {},
  });

  if (status !== 'no-database') {
    if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
      console.log('[db] 내장 PostgreSQL 최초 초기화 중...');
      await embedded.initialise();
    }
    await embedded.start();
  }
  if ((await canConnect(url)) === 'no-database') {
    await embedded.createDatabase(DB_NAME);
  }
  console.log(`[db] 내장 PostgreSQL 실행 중 (port ${port})`);
  return url;
}

export async function initDb() {
  const url = process.env.DATABASE_URL || (await startEmbeddedPostgres());
  pool = new pg.Pool({ connectionString: url });
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
}

export function query(text, params) {
  return pool.query(text, params);
}

export async function closeDb() {
  await pool?.end().catch(() => {});
  await embedded?.stop().catch(() => {});
}
