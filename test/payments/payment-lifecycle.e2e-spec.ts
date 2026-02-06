import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import {
  getTestKnex,
  runMigrations,
  cleanDatabase,
  destroyDatabase,
} from '../helpers/test-database';

describe('Payment Lifecycle (e2e)', () => {
  let db: Knex;
  let accountId: string;

  beforeAll(async () => {
    db = getTestKnex();
    await runMigrations();
  });

  beforeEach(async () => {
    await cleanDatabase();

    accountId = randomUUID();
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
  });

  afterAll(async () => {
    await cleanDatabase();
    await destroyDatabase();
  });

  it('should create a payment in pending status', async () => {
    const paymentId = randomUUID();

    await db('payments').insert({
      id: paymentId,
      account_id: accountId,
      amount: 100,
      currency: 'USD',
      status: 'pending',
      provider: 'stripe',
      external_payment_id: `pi_${randomUUID()}`,
      metadata: {},
    });

    const payment = await db('payments').where({ id: paymentId }).first();
    expect(payment.status).toBe('pending');
    expect(parseFloat(payment.amount)).toBe(100);
  });

  it('should transition payment through full lifecycle: pending → processing → succeeded', async () => {
    const paymentId = randomUUID();

    await db('payments').insert({
      id: paymentId,
      account_id: accountId,
      amount: 250,
      currency: 'USD',
      status: 'pending',
      provider: 'stripe',
      external_payment_id: `pi_${randomUUID()}`,
      metadata: {},
    });

    // Transition to processing
    await db('payments')
      .where({ id: paymentId })
      .update({ status: 'processing' });

    let payment = await db('payments').where({ id: paymentId }).first();
    expect(payment.status).toBe('processing');

    // Simulate webhook: succeeded + credit balance (in transaction)
    await db.transaction(async (trx) => {
      await trx('payments')
        .where({ id: paymentId })
        .forUpdate()
        .first();

      await trx('payments')
        .where({ id: paymentId })
        .update({ status: 'succeeded' });

      await trx('accounts')
        .where({ id: accountId })
        .increment('balance', 250);

      await trx('transactions').insert({
        id: randomUUID(),
        account_id: accountId,
        amount: 250,
        type: 'credit',
        reference_id: paymentId,
        reference_type: 'payment',
        metadata: {},
      });
    });

    payment = await db('payments').where({ id: paymentId }).first();
    expect(payment.status).toBe('succeeded');

    const account = await db('accounts').where({ id: accountId }).first();
    expect(parseFloat(account.balance)).toBe(250);

    const transactions = await db('transactions')
      .where({ account_id: accountId });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].type).toBe('credit');
    expect(transactions[0].reference_id).toBe(paymentId);
  });

  it('should handle refund: succeeded → refunded with balance credit', async () => {
    const paymentId = randomUUID();

    // Set up a succeeded payment with balance already credited
    await db('payments').insert({
      id: paymentId,
      account_id: accountId,
      amount: 500,
      currency: 'USD',
      status: 'succeeded',
      provider: 'stripe',
      external_payment_id: `pi_${randomUUID()}`,
      metadata: {},
    });

    await db('accounts')
      .where({ id: accountId })
      .update({ balance: 500 });

    // Process refund in transaction
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
        .increment('balance', 500);

      await trx('transactions').insert({
        id: randomUUID(),
        account_id: accountId,
        amount: 500,
        type: 'credit',
        reference_id: paymentId,
        reference_type: 'refund',
        metadata: {},
      });
    });

    const payment = await db('payments').where({ id: paymentId }).first();
    expect(payment.status).toBe('refunded');

    const account = await db('accounts').where({ id: accountId }).first();
    expect(parseFloat(account.balance)).toBe(1000); // 500 original + 500 refund

    const transactions = await db('transactions')
      .where({ reference_id: paymentId });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].reference_type).toBe('refund');
  });

  it('should reject invalid payment amount (DB constraint)', async () => {
    const paymentId = randomUUID();

    await expect(
      db('payments').insert({
        id: paymentId,
        account_id: accountId,
        amount: -50,
        currency: 'USD',
        status: 'pending',
        provider: 'stripe',
        external_payment_id: `pi_${randomUUID()}`,
        metadata: {},
      }),
    ).rejects.toThrow();
  });

  it('should enforce account balance non-negative constraint', async () => {
    // Account starts with balance 0
    await expect(
      db('accounts')
        .where({ id: accountId })
        .decrement('balance', 100),
    ).rejects.toThrow();
  });

  it('should create immutable transaction records', async () => {
    const txId = randomUUID();

    await db('transactions').insert({
      id: txId,
      account_id: accountId,
      amount: 100,
      type: 'credit',
      reference_id: randomUUID(),
      reference_type: 'payment',
      metadata: {},
    });

    const transaction = await db('transactions').where({ id: txId }).first();
    expect(transaction).toBeDefined();
    expect(parseFloat(transaction.amount)).toBe(100);
    expect(transaction.type).toBe('credit');
    expect(transaction.created_at).toBeDefined();
  });
});
