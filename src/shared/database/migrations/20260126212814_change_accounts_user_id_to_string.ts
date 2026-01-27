import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Drop unique indexes que usan user_id
  await knex.raw('DROP INDEX IF EXISTS idx_accounts_user_currency');
  await knex.raw('DROP INDEX IF EXISTS idx_accounts_user_primary');

  // 2. Drop index en user_id
  await knex.raw('DROP INDEX IF EXISTS accounts_user_id_index');

  // 3. Cambiar user_id de UUID a VARCHAR(255)
  await knex.schema.alterTable('accounts', (table) => {
    table.string('user_id', 255).notNullable().alter();
  });

  // 4. Recrear índices
  await knex.raw(`
    CREATE INDEX accounts_user_id_index ON accounts(user_id)
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX idx_accounts_user_currency
    ON accounts(user_id, currency)
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX idx_accounts_user_primary
    ON accounts(user_id)
    WHERE is_primary = true
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Rollback: volver a UUID
  await knex.raw('DROP INDEX IF EXISTS idx_accounts_user_currency');
  await knex.raw('DROP INDEX IF EXISTS idx_accounts_user_primary');
  await knex.raw('DROP INDEX IF EXISTS accounts_user_id_index');

  await knex.schema.alterTable('accounts', (table) => {
    table.uuid('user_id').notNullable().alter();
  });

  await knex.raw(`
    CREATE INDEX accounts_user_id_index ON accounts(user_id)
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX idx_accounts_user_currency
    ON accounts(user_id, currency)
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX idx_accounts_user_primary
    ON accounts(user_id)
    WHERE is_primary = true
  `);
}
