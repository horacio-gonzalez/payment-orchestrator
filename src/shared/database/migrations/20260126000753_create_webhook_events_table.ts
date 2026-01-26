import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create UUID extension if not exists (reuse from previous migrations)
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // Reuse update_updated_at_column function from accounts migration
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  // Create webhook_events table
  await knex.schema.createTable('webhook_events', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));

    // Idempotency key (provider's unique webhook ID)
    table.string('external_id', 255).notNullable().unique().index();

    // Provider info
    table
      .enum('provider', ['stripe', 'paypal', 'mock'], {
        useNative: true,
        enumName: 'webhook_provider',
      })
      .notNullable()
      .index();

    // Event details
    table.string('event_type', 100).notNullable().index();
    table.jsonb('payload').notNullable(); // Raw webhook body

    // Processing status
    table
      .enum(
        'status',
        ['pending', 'processing', 'processed', 'failed', 'duplicate'],
        {
          useNative: true,
          enumName: 'webhook_event_status',
        },
      )
      .notNullable()
      .defaultTo('pending')
      .index();

    // Associated payment (nullable - webhook may arrive before payment creation)
    table
      .uuid('payment_id')
      .nullable()
      .references('id')
      .inTable('payments')
      .onDelete('SET NULL')
      .index();

    // Error tracking
    table.text('error_message').nullable();

    // Retry tracking
    table.integer('retry_count').notNullable().defaultTo(0);

    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now()).index();
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('processed_at').nullable();
  });

  // Add check constraints
  await knex.raw(`
    ALTER TABLE webhook_events
    ADD CONSTRAINT webhook_events_retry_count_non_negative
    CHECK (retry_count >= 0)
  `);

  // Composite indexes for common query patterns
  await knex.raw(`
    CREATE INDEX idx_webhook_events_provider_created
    ON webhook_events(provider, created_at DESC)
  `);

  await knex.raw(`
    CREATE INDEX idx_webhook_events_status_retry
    ON webhook_events(status, retry_count)
    WHERE status = 'failed'
  `);

  await knex.raw(`
    CREATE INDEX idx_webhook_events_payment
    ON webhook_events(payment_id)
    WHERE payment_id IS NOT NULL
  `);

  // Create trigger for automatic updated_at
  await knex.raw(`
    CREATE TRIGGER update_webhook_events_updated_at
    BEFORE UPDATE ON webhook_events
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop trigger
  await knex.raw(
    'DROP TRIGGER IF EXISTS update_webhook_events_updated_at ON webhook_events',
  );

  // Drop table (CASCADE will drop indexes and constraints)
  await knex.schema.dropTableIfExists('webhook_events');

  // Drop custom types
  await knex.raw('DROP TYPE IF EXISTS webhook_event_status');
  await knex.raw('DROP TYPE IF EXISTS webhook_provider');

  // Note: We don't drop the update_updated_at_column function
  // because other tables may still be using it
}
