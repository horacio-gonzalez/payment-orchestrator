import { Test, TestingModule } from '@nestjs/testing';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import {
  getTestKnex,
  runMigrations,
  cleanDatabase,
  destroyDatabase,
} from '../helpers/test-database';
import { AccountsService } from '../../src/modules/accounts/domain/accounts.service';
import { AccountsRepository } from '../../src/modules/accounts/infrastructure/accounts.repository';
import { IAccountsRepository } from '../../src/modules/accounts/domain/i-accounts.repository';
import { Currency } from '../../src/modules/accounts/domain/account.entity';

describe('AccountsService (integration)', () => {
  let module: TestingModule;
  let accountsService: AccountsService;
  let db: Knex;
  let accountId: string;

  beforeAll(async () => {
    db = getTestKnex();
    await runMigrations();

    module = await Test.createTestingModule({
      providers: [
        AccountsService,
        {
          provide: IAccountsRepository,
          useClass: AccountsRepository,
        },
        {
          provide: 'KNEX',
          useValue: db,
        },
      ],
    }).compile();

    accountsService = module.get<AccountsService>(AccountsService);
  });

  beforeEach(async () => {
    await cleanDatabase();

    // Create a test account with initial balance of 1000
    accountId = randomUUID();
    await db('accounts').insert({
      id: accountId,
      user_id: `user-${randomUUID()}`,
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
    await module.close();
    await destroyDatabase();
  });

  // ============================================
  // creditFunds
  // ============================================

  describe('creditFunds', () => {
    it('should increase balance and allow verification', async () => {
      await accountsService.creditFunds(accountId, 500);

      const account = await db('accounts').where({ id: accountId }).first();
      expect(parseFloat(account.balance)).toBe(1500);
    });

    it('should work with decimal amounts', async () => {
      await accountsService.creditFunds(accountId, 99.99);

      const account = await db('accounts').where({ id: accountId }).first();
      expect(parseFloat(account.balance)).toBe(1099.99);
    });

    it('should reject credit to closed account', async () => {
      await db('accounts').where({ id: accountId }).update({ status: 'closed' });

      await expect(
        accountsService.creditFunds(accountId, 100),
      ).rejects.toThrow('cannot receive credits');
    });

    it('should throw NotFoundException for non-existent account', async () => {
      await expect(
        accountsService.creditFunds(randomUUID(), 100),
      ).rejects.toThrow('not found');
    });
  });

  // ============================================
  // debitFunds
  // ============================================

  describe('debitFunds', () => {
    it('should decrease balance', async () => {
      await accountsService.debitFunds(accountId, 300);

      const account = await db('accounts').where({ id: accountId }).first();
      expect(parseFloat(account.balance)).toBe(700);
    });

    it('should reject insufficient funds', async () => {
      await expect(
        accountsService.debitFunds(accountId, 1500),
      ).rejects.toThrow('Insufficient funds');
    });

    it('should allow debit of exact balance', async () => {
      await accountsService.debitFunds(accountId, 1000);

      const account = await db('accounts').where({ id: accountId }).first();
      expect(parseFloat(account.balance)).toBe(0);
    });

    it('should throw NotFoundException for non-existent account', async () => {
      await expect(
        accountsService.debitFunds(randomUUID(), 100),
      ).rejects.toThrow('not found');
    });
  });

  // ============================================
  // Amount validation
  // ============================================

  describe('amount validation', () => {
    it('should reject zero amount', async () => {
      await expect(
        accountsService.creditFunds(accountId, 0),
      ).rejects.toThrow('Amount must be greater than zero');
    });

    it('should reject negative amount', async () => {
      await expect(
        accountsService.creditFunds(accountId, -50),
      ).rejects.toThrow('Amount must be greater than zero');
    });

    it('should reject too many decimal places', async () => {
      await expect(
        accountsService.creditFunds(accountId, 10.123),
      ).rejects.toThrow('Amount cannot have more than 2 decimal places');
    });

    it('should reject Infinity', async () => {
      await expect(
        accountsService.creditFunds(accountId, Infinity),
      ).rejects.toThrow('Amount must be a valid number');
    });

    it('should reject NaN', async () => {
      await expect(
        accountsService.creditFunds(accountId, NaN),
      ).rejects.toThrow('Amount must be a valid number');
    });
  });

  // ============================================
  // Concurrency: FOR UPDATE through service layer
  // ============================================

  describe('concurrency (FOR UPDATE through service)', () => {
    it('should handle 10 concurrent creditFunds without race conditions', async () => {
      const concurrentOps = 10;
      const creditAmount = 50;

      const promises = Array.from({ length: concurrentOps }, () =>
        accountsService.creditFunds(accountId, creditAmount),
      );

      await Promise.all(promises);

      const account = await db('accounts').where({ id: accountId }).first();
      expect(parseFloat(account.balance)).toBe(1000 + concurrentOps * creditAmount);
    });

    it('should handle concurrent debits exceeding balance — only valid ones succeed', async () => {
      // Balance is 1000, attempt 15 debits of 100 each
      const results = await Promise.allSettled(
        Array.from({ length: 15 }, () =>
          accountsService.debitFunds(accountId, 100),
        ),
      );

      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      expect(succeeded).toBe(10);
      expect(failed).toBe(5);

      const account = await db('accounts').where({ id: accountId }).first();
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
        op.type === 'credit'
          ? accountsService.creditFunds(accountId, op.amount)
          : accountsService.debitFunds(accountId, op.amount),
      );

      await Promise.all(promises);

      const account = await db('accounts').where({ id: accountId }).first();
      // 1000 + 200 - 100 + 300 - 150 + 50 = 1300
      expect(parseFloat(account.balance)).toBe(1300);
    });
  });

  // ============================================
  // createAccount
  // ============================================

  describe('createAccount', () => {
    it('should create a new account with zero balance', async () => {
      const userId = `user-${randomUUID()}`;
      const account = await accountsService.createAccount(userId, Currency.USD);

      expect(account.userId).toBe(userId);
      expect(account.balance).toBe(0);
      expect(account.reservedBalance).toBe(0);
      expect(account.currency).toBe(Currency.USD);

      // Verify persisted in DB
      const row = await db('accounts').where({ id: account.id }).first();
      expect(row).toBeDefined();
      expect(parseFloat(row.balance)).toBe(0);
    });
  });

  // ============================================
  // findById / findPrimaryByUser
  // ============================================

  describe('findById', () => {
    it('should return account by ID', async () => {
      const account = await accountsService.findById(accountId);

      expect(account.id).toBe(accountId);
      expect(account.balance).toBe(1000);
    });

    it('should throw NotFoundException for non-existent ID', async () => {
      await expect(
        accountsService.findById(randomUUID()),
      ).rejects.toThrow('not found');
    });
  });

  // ============================================
  // reconcileBalance
  // ============================================

  describe('reconcileBalance', () => {
    it('should report zero discrepancy when balance matches transactions', async () => {
      // Start with 0 balance, credit 500 via transaction
      await db('accounts').where({ id: accountId }).update({ balance: 0 });

      await db('transactions').insert({
        id: randomUUID(),
        account_id: accountId,
        amount: 500,
        type: 'credit',
        reference_id: randomUUID(),
        reference_type: 'payment',
        metadata: {},
      });

      await db('accounts').where({ id: accountId }).update({ balance: 500 });

      const result = await accountsService.reconcileBalance(accountId);

      expect(result.cached).toBe(500);
      expect(result.calculated).toBe(500);
      expect(result.discrepancy).toBe(0);
    });

    it('should detect discrepancy when cached balance differs from transactions', async () => {
      // Insert transaction for 500 but leave balance at 1000 (mismatch)
      await db('transactions').insert({
        id: randomUUID(),
        account_id: accountId,
        amount: 500,
        type: 'credit',
        reference_id: randomUUID(),
        reference_type: 'payment',
        metadata: {},
      });

      const result = await accountsService.reconcileBalance(accountId);

      expect(result.cached).toBe(1000);
      expect(result.calculated).toBe(500);
      expect(result.discrepancy).toBe(500);
    });

    it('should handle account with no transactions', async () => {
      const result = await accountsService.reconcileBalance(accountId);

      expect(result.cached).toBe(1000);
      expect(result.calculated).toBe(0);
      expect(result.discrepancy).toBe(1000);
    });

    it('should throw NotFoundException for non-existent account', async () => {
      await expect(
        accountsService.reconcileBalance(randomUUID()),
      ).rejects.toThrow('not found');
    });
  });
});
