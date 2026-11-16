import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

export function connectDatabase(url: string) {
  const sql = postgres(url, { max: 10, onnotice: () => {} });

  return {
    db: drizzle(sql, { schema }),
    close: () => sql.end({ timeout: 5 }),
  };
}

export type DatabaseConnection = ReturnType<typeof connectDatabase>;
export type Database = DatabaseConnection['db'];
