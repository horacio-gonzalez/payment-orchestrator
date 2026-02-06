import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import {
  getTestKnex,
  runMigrations,
  cleanDatabase,
  destroyDatabase,
} from '../helpers/test-database';

describe('Concurrent Balance Operations (e2e)', () => {
  let db: Knex;
  let accountId: string;

  beforeAll(async () => {
    db = getTestKnex();
    await runMigrations();
  });

  beforeEach(async () => {
    await cleanDatabase();

    // Create a test account with initial balance
    accountId = randomUUID();
    await db('accounts').insert({
      id: accountId,
      user_id: 'test-user-1',
      balance: 1000,
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

  it('should handle concurrent credits without race conditions (FOR UPDATE)', async () => {
    const concurrentOps = 10;
    const creditAmount = 50;

    // Launch N concurrent credit operations
    const promises = Array.from({ length: concurrentOps }, () =>
      db.transaction(async (trx) => {
        // Lock row with FOR UPDATE
        await trx('accounts')
          .where({ id: accountId })
          .forUpdate()
          .first();

        await trx('accounts')
          .where({ id: accountId })
          .increment('balance', creditAmount)
          .update({ updated_at: new Date() });
      }),
    );

    await Promise.all(promises);

    const account = await db('accounts').where({ id: accountId }).first();
    const expectedBalance = 1000 + concurrentOps * creditAmount;

    expect(parseFloat(account.balance)).toBe(expectedBalance);
  });

  it('should handle concurrent debits without overdraft (FOR UPDATE)', async () => {
    const concurrentOps = 10;
    const debitAmount = 100;
    // Initial balance is 1000, so only 10 debits of 100 should succeed

    let successCount = 0;
    let failCount = 0;

    const promises = Array.from({ length: 15 }, () =>
      db
        .transaction(async (trx) => {
          const account = await trx('accounts')
            .where({ id: accountId })
            .forUpdate()
            .first();

          const available = parseFloat(account.balance) - parseFloat(account.reserved_balance);

          if (available < debitAmount) {
            throw new Error('Insufficient funds');
          }

          await trx('accounts')
            .where({ id: accountId })
            .decrement('balance', debitAmount)
            .update({ updated_at: new Date() });

          successCount++;
        })
        .catch(() => {
          failCount++;
        }),
    );

    await Promise.all(promises);

    const account = await db('accounts').where({ id: accountId }).first();

    // Exactly 10 should succeed (1000 / 100)
    expect(successCount).toBe(10);
    expect(failCount).toBe(5);
    expect(parseFloat(account.balance)).toBe(0);
  });

  it('should handle mixed concurrent credit and debit operations', async () => {
    const ops: Array<{ type: 'credit' | 'debit'; amount: number }> = [
      { type: 'credit', amount: 200 },
      { type: 'debit', amount: 100 },
      { type: 'credit', amount: 300 },
      { type: 'debit', amount: 150 },
      { type: 'credit', amount: 50 },
    ];

    const promises = ops.map((op) =>
      db.transaction(async (trx) => {
        await trx('accounts')
          .where({ id: accountId })
          .forUpdate()
          .first();

        if (op.type === 'credit') {
          await trx('accounts')
            .where({ id: accountId })
            .increment('balance', op.amount)
            .update({ updated_at: new Date() });
        } else {
          await trx('accounts')
            .where({ id: accountId })
            .decrement('balance', op.amount)
            .update({ updated_at: new Date() });
        }
      }),
    );

    await Promise.all(promises);

    const account = await db('accounts').where({ id: accountId }).first();
    // 1000 + 200 - 100 + 300 - 150 + 50 = 1300
    expect(parseFloat(account.balance)).toBe(1300);
  });
});
