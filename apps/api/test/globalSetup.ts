import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { testDatabaseUrl } from './testDb';

/** Har bir test ishga tushishida toza test bazasini yaratadi va migratsiyalarni qo'llaydi. */
export default async function setup(): Promise<void> {
  const baseUrl = process.env.DATABASE_URL;
  const { url, name } = testDatabaseUrl(baseUrl);

  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
