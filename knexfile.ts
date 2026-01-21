import { Knex } from 'knex';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

export const knexConfig: Knex.Config = {
  client: 'pg',
  connection: {
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT ?? 5432),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
  },
  pool: {
    min: 2,
    max: 10,
  },
  migrations: {
    directory: path.join(__dirname, 'src/shared/database/migrations'),
    tableName: 'knex_migrations',
  },
};

export default knexConfig;
