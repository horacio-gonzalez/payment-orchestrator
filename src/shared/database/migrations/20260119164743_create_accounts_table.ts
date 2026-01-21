import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  await knex.schema.createTable('accounts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));

    // NO unique en user_id solo - permite múltiples accounts
    table.uuid('user_id').notNullable().index();

    table.decimal('balance', 19, 4).notNullable().defaultTo(0);
    table.decimal('reserved_balance', 19, 4).notNullable().defaultTo(0);

    table
      .enum('currency', ['USD', 'EUR', 'ARS', 'GBP'])
      .notNullable()
      .defaultTo('USD');

    table
      .enum('status', ['active', 'frozen', 'suspended', 'closed'])
      .notNullable()
      .defaultTo('active')
      .index();

    // Indica si es el account principal del user (útil para single-account mode)
    table.boolean('is_primary').notNullable().defaultTo(true);

    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // CONSTRAINT: Un user solo puede tener UN account por currency
  await knex.raw(`
    CREATE UNIQUE INDEX idx_accounts_user_currency
    ON accounts(user_id, currency)
  `);

  // CONSTRAINT: Un user solo puede tener UN account primary
  await knex.raw(`
    CREATE UNIQUE INDEX idx_accounts_user_primary
    ON accounts(user_id)
    WHERE is_primary = true
  `);

  await knex.raw(`
    ALTER TABLE accounts
    ADD CONSTRAINT accounts_balance_non_negative CHECK (balance >= 0),
    ADD CONSTRAINT accounts_reserved_balance_non_negative CHECK (reserved_balance >= 0),
    ADD CONSTRAINT accounts_available_balance_valid CHECK (balance >= reserved_balance)
  `);

  await knex.raw(`
    CREATE TRIGGER update_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
  `);
}

export async function down(knex: Knex): Promise<void> {
  // 1. Drop trigger ANTES de drop table
  await knex.raw(
    'DROP TRIGGER IF EXISTS update_accounts_updated_at ON accounts',
  );

  // 2. Drop table (esto borra constraints e índices automáticamente)
  await knex.schema.dropTableIfExists('accounts');

  // 3. NO borrar función - payments la usa
  // await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column');

  // 4. NO borrar extension - otras migraciones podrían usarla
  // await knex.raw('DROP EXTENSION IF EXISTS "uuid-ossp"');
}
