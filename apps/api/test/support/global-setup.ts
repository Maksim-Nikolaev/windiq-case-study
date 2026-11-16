import postgres from 'postgres';
import { runMigrations } from '../../src/infrastructure/db/migrate.ts';
import { TEST_DATABASE_URL } from './test-database.ts';

export default async function setup(): Promise<void> {
  const target = new URL(TEST_DATABASE_URL);
  const databaseName = target.pathname.slice(1);
  const admin = postgres(new URL('/postgres', target).href, { max: 1, onnotice: () => {} });

  try {
    const existing = await admin`select 1 from pg_database where datname = ${databaseName}`;

    if (existing.length === 0) {
      await admin.unsafe(`create database "${databaseName}"`);
    }
  } finally {
    await admin.end();
  }

  await runMigrations(TEST_DATABASE_URL);
}
