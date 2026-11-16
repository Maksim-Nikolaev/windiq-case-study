import { runMigrations } from './infrastructure/db/migrate.ts';

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined) {
  throw new Error('DATABASE_URL is not set');
}

await runMigrations(databaseUrl);
console.log('migrations applied');
