import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // Función (si no existe desde accounts)
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  await knex.schema.createTable('payments', (table) => {
    // Primary Key
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));

    // Foreign Key a Accounts
    table
      .uuid('account_id')
      .notNullable()
      .index() // ← AGREGADO
      .references('id')
      .inTable('accounts')
      .onDelete('RESTRICT');

    // Payment details
    table.decimal('amount', 19, 4).notNullable();
    table.string('currency', 3).notNullable(); // ISO 4217

    // Status
    table
      .enum('status', [
        'pending',
        'processing',
        'succeeded',
        'failed',
        'refunded',
        'cancelled',
      ])
      .notNullable()
      .defaultTo('pending')
      .index();

    // Provider info
    table.string('provider', 50).notNullable(); // 'stripe', 'paypal', 'mock'
    table.string('external_payment_id', 255).unique().index().notNullable();
    table.string('payment_method', 50).nullable(); // ← AGREGADO: 'card', 'bank_transfer'

    // Additional data
    table.text('description').nullable(); // ← AGREGADO
    table.jsonb('metadata').defaultTo('{}');

    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now()).index(); // ← AGREGADO index
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('processed_at').nullable(); // ← AGREGADO
  });

  // Constraints
  await knex.raw(`
    ALTER TABLE payments
    ADD CONSTRAINT payments_amount_positive
    CHECK (amount > 0)
  `);

  // Compound indexes para queries comunes
  await knex.raw(`
    CREATE INDEX idx_payments_account_status
    ON payments(account_id, status)
  `);

  await knex.raw(`
    CREATE INDEX idx_payments_account_created
    ON payments(account_id, created_at DESC)
  `);

  // Trigger
  await knex.raw(`
    CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('payments');
  await knex.raw(
    'DROP TRIGGER IF EXISTS update_payments_updated_at ON payments',
  );
  // No borramos función porque accounts la usa
}
