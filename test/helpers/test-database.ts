import knex, { Knex } from 'knex';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

let testKnex: Knex;

export function getTestKnex(): Knex {
  if (!testKnex) {
    testKnex = knex({
      client: 'pg',
      connection: {
        host: process.env.DATABASE_HOST || 'localhost',
        port: Number(process.env.DATABASE_PORT ?? 5432),
        user: process.env.DATABASE_USER || 'postgres',
        password: process.env.DATABASE_PASSWORD || 'postgres',
        database: process.env.DATABASE_NAME || 'payment-orchestrator',
      },
      pool: { min: 1, max: 5 },
      migrations: {
        directory: path.join(__dirname, '../../src/shared/database/migrations'),
        tableName: 'knex_migrations',
      },
    });
  }
  return testKnex;
}

export async function runMigrations(): Promise<void> {
  const db = getTestKnex();
  await db.migrate.latest();
}

export async function cleanDatabase(): Promise<void> {
  const db = getTestKnex();
  // Order matters due to foreign keys
  await db('transactions').del();
  await db('webhook_events').del();
  await db('payments').del();
  await db('accounts').del();
}

export async function destroyDatabase(): Promise<void> {
  if (testKnex) {
    await testKnex.destroy();
    testKnex = null;
  }
}
