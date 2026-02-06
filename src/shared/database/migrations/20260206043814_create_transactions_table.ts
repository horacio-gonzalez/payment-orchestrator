import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));

    table
      .uuid('account_id')
      .notNullable()
      .references('id')
      .inTable('accounts')
      .onDelete('RESTRICT');

    table.decimal('amount', 19, 4).notNullable();

    table
      .enum('type', ['credit', 'debit', 'reserve', 'release'])
      .notNullable();

    table.string('reference_id', 255).nullable();
    table.string('reference_type', 50).nullable();
    table.text('description').nullable();
    table.jsonb('metadata').defaultTo('{}');

    // Immutable: only created_at, no updated_at
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Amount must not be zero
  await knex.raw(`
    ALTER TABLE transactions
    ADD CONSTRAINT transactions_amount_not_zero
    CHECK (amount != 0)
  `);

  // Common query indexes
  await knex.raw(`
    CREATE INDEX idx_transactions_account_created
    ON transactions(account_id, created_at DESC)
  `);

  await knex.raw(`
    CREATE INDEX idx_transactions_reference
    ON transactions(reference_id)
    WHERE reference_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('transactions');
}
