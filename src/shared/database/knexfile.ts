import { Knex } from 'knex';
import * as dotenv from 'dotenv';
import * as path from 'path'; // <--- Agregar este import

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
    // Usar __dirname asegura que la carpeta se cree relativa a ESTE archivo
    directory: path.join(__dirname, 'migrations'),
    tableName: 'knex_migrations',
  },
};

export default knexConfig;
