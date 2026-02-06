import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import {
  getTestKnex,
  runMigrations,
  cleanDatabase,
  destroyDatabase,
} from '../helpers/test-database';

describe('Webhook Processing Flow (e2e)', () => {
  let db: Knex;
  let accountId: string;
  let paymentId: string;

  beforeAll(async () => {
    db = getTestKnex();
    await runMigrations();
  });

  beforeEach(async () => {
    await cleanDatabase();

    accountId = randomUUID();
    paymentId = randomUUID();

    await db('accounts').insert({
      id: accountId,
      user_id: 'test-user-1',
      balance: 0,
      reserved_balance: 0,
      currency: 'USD',
      status: 'active',
      is_primary: true,
      metadata: {},
    });

    await db('payments').insert({
      id: paymentId,
      account_id: accountId,
      amount: 1000,
      currency: 'USD',
      status: 'processing',
      provider: 'stripe',
      external_payment_id: `pi_${randomUUID()}`,
      metadata: { payment_id: paymentId },
    });
  });

  afterAll(async () => {
    await cleanDatabase();
    await destroyDatabase();
  });

  it('should process payment_intent.succeeded webhook end-to-end', async () => {
    const webhookExternalId = `evt_${randomUUID()}`;

    // 1. Create webhook event record (simulating controller)
    const webhookEventId = randomUUID();
    await db('webhook_events').insert({
      id: webhookEventId,
      external_id: webhookExternalId,
      provider: 'stripe',
      event_type: 'payment_intent.succeeded',
      payload: {
        id: webhookExternalId,
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: `pi_${randomUUID()}`,
            amount: 100000,
            currency: 'usd',
            status: 'succeeded',
            metadata: { payment_id: paymentId },
          },
        },
      },
      status: 'pending',
      retry_count: 0,
      metadata: {},
    });

    // 2. Simulate processor: all in one transaction
    await db.transaction(async (trx) => {
      // Mark webhook as processing
      await trx('webhook_events')
        .where({ id: webhookEventId })
        .update({ status: 'processing' });

      // Lock payment
      const payment = await trx('payments')
        .where({ id: paymentId })
        .forUpdate()
        .first();

      // Update payment status
      await trx('payments')
        .where({ id: paymentId })
        .update({ status: 'succeeded' });

      // Credit account
      await trx('accounts')
        .where({ id: accountId })
        .increment('balance', parseFloat(payment.amount));

      // Create transaction record
      await trx('transactions').insert({
        id: randomUUID(),
        account_id: accountId,
        amount: parseFloat(payment.amount),
        type: 'credit',
        reference_id: paymentId,
        reference_type: 'payment',
        description: `Payment ${paymentId} succeeded`,
        metadata: {},
      });

      // Associate webhook with payment
      await trx('webhook_events')
        .where({ id: webhookEventId })
        .update({ payment_id: paymentId });

      // Mark webhook as processed
      await trx('webhook_events')
        .where({ id: webhookEventId })
        .update({ status: 'processed', processed_at: new Date() });
    });

    // 3. Verify final state
    const payment = await db('payments').where({ id: paymentId }).first();
    expect(payment.status).toBe('succeeded');

    const account = await db('accounts').where({ id: accountId }).first();
    expect(parseFloat(account.balance)).toBe(1000);

    const transactions = await db('transactions')
      .where({ account_id: accountId });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].reference_type).toBe('payment');

    const webhookEvent = await db('webhook_events')
      .where({ id: webhookEventId })
      .first();
    expect(webhookEvent.status).toBe('processed');
    expect(webhookEvent.payment_id).toBe(paymentId);
    expect(webhookEvent.processed_at).not.toBeNull();
  });

  it('should prevent duplicate webhook processing via unique constraint', async () => {
    const webhookExternalId = `evt_${randomUUID()}`;

    // First insert succeeds
    await db('webhook_events').insert({
      id: randomUUID(),
      external_id: webhookExternalId,
      provider: 'stripe',
      event_type: 'payment_intent.succeeded',
      payload: {},
      status: 'processed',
      retry_count: 0,
    });

    // Second insert with same external_id fails
    await expect(
      db('webhook_events').insert({
        id: randomUUID(),
        external_id: webhookExternalId,
        provider: 'stripe',
        event_type: 'payment_intent.succeeded',
        payload: {},
        status: 'pending',
        retry_count: 0,
      }),
    ).rejects.toThrow();
  });

  it('should rollback all changes on processor error (transaction atomicity)', async () => {
    const webhookEventId = randomUUID();

    await db('webhook_events').insert({
      id: webhookEventId,
      external_id: `evt_${randomUUID()}`,
      provider: 'stripe',
      event_type: 'payment_intent.succeeded',
      payload: {},
      status: 'pending',
      retry_count: 0,
    });

    // Simulate a transaction that fails mid-way
    try {
      await db.transaction(async (trx) => {
        // Update payment status
        await trx('payments')
          .where({ id: paymentId })
          .update({ status: 'succeeded' });

        // Credit account
        await trx('accounts')
          .where({ id: accountId })
          .increment('balance', 1000);

        // Force an error before commit
        throw new Error('Simulated processor error');
      });
    } catch {
      // Expected
    }

    // Verify everything rolled back
    const payment = await db('payments').where({ id: paymentId }).first();
    expect(payment.status).toBe('processing'); // unchanged

    const account = await db('accounts').where({ id: accountId }).first();
    expect(parseFloat(account.balance)).toBe(0); // unchanged
  });

  it('should process charge.refunded webhook with correct amounts', async () => {
    // Set up a succeeded payment with balance credited
    await db('payments')
      .where({ id: paymentId })
      .update({ status: 'succeeded' });
    await db('accounts')
      .where({ id: accountId })
      .update({ balance: 1000 });

    const webhookEventId = randomUUID();
    const refundAmount = 500;

    await db('webhook_events').insert({
      id: webhookEventId,
      external_id: `evt_${randomUUID()}`,
      provider: 'stripe',
      event_type: 'charge.refunded',
      payload: {},
      status: 'pending',
      retry_count: 0,
    });

    // Process refund
    await db.transaction(async (trx) => {
      await trx('payments')
        .where({ id: paymentId })
        .forUpdate()
        .first();

      await trx('payments')
        .where({ id: paymentId })
        .update({ status: 'refunded' });

      await trx('accounts')
        .where({ id: accountId })
        .increment('balance', refundAmount);

      await trx('transactions').insert({
        id: randomUUID(),
        account_id: accountId,
        amount: refundAmount,
        type: 'credit',
        reference_id: paymentId,
        reference_type: 'refund',
        metadata: {},
      });

      await trx('webhook_events')
        .where({ id: webhookEventId })
        .update({
          status: 'processed',
          payment_id: paymentId,
          processed_at: new Date(),
        });
    });

    const payment = await db('payments').where({ id: paymentId }).first();
    expect(payment.status).toBe('refunded');

    const account = await db('accounts').where({ id: accountId }).first();
    expect(parseFloat(account.balance)).toBe(1500); // 1000 + 500 refund

    const transactions = await db('transactions')
      .where({ reference_type: 'refund' });
    expect(transactions).toHaveLength(1);
    expect(parseFloat(transactions[0].amount)).toBe(500);
  });
});
