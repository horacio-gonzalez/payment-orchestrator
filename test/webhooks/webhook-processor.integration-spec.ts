import { Test, TestingModule } from '@nestjs/testing';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { Job } from 'bull';
import {
  getTestKnex,
  runMigrations,
  cleanDatabase,
  destroyDatabase,
} from '../helpers/test-database';
import { WebhookProcessor } from '../../src/modules/webhooks/infrastructure/webhook.processor';
import { PaymentRepository } from '../../src/modules/payments/infrastructure/payment.repository';
import { AccountsService } from '../../src/modules/accounts/domain/accounts.service';
import { AccountsRepository } from '../../src/modules/accounts/infrastructure/accounts.repository';
import { IAccountsRepository } from '../../src/modules/accounts/domain/i-accounts.repository';
import { TransactionsService } from '../../src/modules/transactions/domain/transactions.service';
import { TransactionsRepository } from '../../src/modules/transactions/infrastructure/transactions.repository';
import { ITransactionsRepository } from '../../src/modules/transactions/domain/i-transactions.repository';
import { WebhookEventsRepository } from '../../src/modules/webhooks/infrastructure/webhook-events.repository';
import { IWebhookEventsRepository } from '../../src/modules/webhooks/domain/i-webhook-events.repository';

describe('WebhookProcessor (integration)', () => {
  let module: TestingModule;
  let processor: WebhookProcessor;
  let db: Knex;
  let accountId: string;
  let paymentId: string;

  beforeAll(async () => {
    db = getTestKnex();
    await runMigrations();

    module = await Test.createTestingModule({
      providers: [
        WebhookProcessor,
        PaymentRepository,
        AccountsService,
        { provide: IAccountsRepository, useClass: AccountsRepository },
        TransactionsService,
        { provide: ITransactionsRepository, useClass: TransactionsRepository },
        { provide: IWebhookEventsRepository, useClass: WebhookEventsRepository },
        { provide: 'KNEX', useValue: db },
      ],
    }).compile();

    processor = module.get<WebhookProcessor>(WebhookProcessor);
  });

  beforeEach(async () => {
    await cleanDatabase();

    accountId = randomUUID();
    paymentId = randomUUID();

    await db('accounts').insert({
      id: accountId,
      user_id: `user-${randomUUID()}`,
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
      metadata: {},
    });
  });

  afterAll(async () => {
    await cleanDatabase();
    await module.close();
    await destroyDatabase();
  });

  function createWebhookJob(webhookEventId: string, type: string, overrides?: any): Job {
    return {
      id: `job-${randomUUID()}`,
      data: {
        webhookEventId,
        payload: {
          id: `evt_${randomUUID()}`,
          type,
          data: {
            object: {
              id: `pi_${randomUUID()}`,
              amount: 100000,
              currency: 'usd',
              status: type === 'payment_intent.succeeded' ? 'succeeded' : 'failed',
              metadata: { payment_id: paymentId },
              ...overrides?.data?.object,
            },
          },
          ...overrides,
        },
      },
    } as unknown as Job;
  }

  async function insertWebhookEvent(id: string, eventType: string): Promise<void> {
    await db('webhook_events').insert({
      id,
      external_id: `evt_${randomUUID()}`,
      provider: 'stripe',
      event_type: eventType,
      payload: JSON.stringify({}),
      status: 'pending',
      retry_count: 0,
    });
  }

  // ============================================
  // payment_intent.succeeded
  // ============================================

  describe('payment_intent.succeeded', () => {
    it('should update payment status, credit balance, log transaction, mark webhook processed', async () => {
      const webhookEventId = randomUUID();
      await insertWebhookEvent(webhookEventId, 'payment_intent.succeeded');

      const job = createWebhookJob(webhookEventId, 'payment_intent.succeeded');
      await processor.processPaymentWebhook(job);

      // Payment status updated
      const payment = await db('payments').where({ id: paymentId }).first();
      expect(payment.status).toBe('succeeded');

      // Balance credited
      const account = await db('accounts').where({ id: accountId }).first();
      expect(parseFloat(account.balance)).toBe(1000);

      // Transaction logged
      const transactions = await db('transactions').where({ account_id: accountId });
      expect(transactions).toHaveLength(1);
      expect(transactions[0].type).toBe('credit');
      expect(parseFloat(transactions[0].amount)).toBe(1000);
      expect(transactions[0].reference_id).toBe(paymentId);
      expect(transactions[0].reference_type).toBe('payment');

      // Webhook marked processed
      const webhook = await db('webhook_events').where({ id: webhookEventId }).first();
      expect(webhook.status).toBe('processed');
      expect(webhook.payment_id).toBe(paymentId);
      expect(webhook.processed_at).not.toBeNull();
    });
  });

  // ============================================
  // payment_intent.payment_failed
  // ============================================

  describe('payment_intent.payment_failed', () => {
    it('should mark payment as failed with no balance change', async () => {
      const webhookEventId = randomUUID();
      await insertWebhookEvent(webhookEventId, 'payment_intent.payment_failed');

      const job = createWebhookJob(webhookEventId, 'payment_intent.payment_failed');
      await processor.processPaymentWebhook(job);

      // Payment status → failed
      const payment = await db('payments').where({ id: paymentId }).first();
      expect(payment.status).toBe('failed');

      // Balance unchanged
      const account = await db('accounts').where({ id: accountId }).first();
      expect(parseFloat(account.balance)).toBe(0);

      // No transaction records
      const transactions = await db('transactions').where({ account_id: accountId });
      expect(transactions).toHaveLength(0);

      // Webhook processed
      const webhook = await db('webhook_events').where({ id: webhookEventId }).first();
      expect(webhook.status).toBe('processed');
      expect(webhook.payment_id).toBe(paymentId);
    });
  });

  // ============================================
  // charge.refunded
  // ============================================

  describe('charge.refunded', () => {
    it('should refund payment and credit balance back', async () => {
      // First make payment succeeded with balance credited
      await db('payments').where({ id: paymentId }).update({ status: 'succeeded' });
      await db('accounts').where({ id: accountId }).update({ balance: 1000 });

      const webhookEventId = randomUUID();
      await insertWebhookEvent(webhookEventId, 'charge.refunded');

      const job = createWebhookJob(webhookEventId, 'charge.refunded', {
        data: {
          object: {
            amount_refunded: 50000, // 500 in cents
            metadata: { payment_id: paymentId },
          },
        },
      });

      await processor.processPaymentWebhook(job);

      // Payment status → refunded
      const payment = await db('payments').where({ id: paymentId }).first();
      expect(payment.status).toBe('refunded');

      // Balance credited with refund amount (500 = 50000/100)
      const account = await db('accounts').where({ id: accountId }).first();
      expect(parseFloat(account.balance)).toBe(1500);

      // Refund transaction logged
      const transactions = await db('transactions').where({ account_id: accountId });
      expect(transactions).toHaveLength(1);
      expect(transactions[0].reference_type).toBe('refund');
      expect(parseFloat(transactions[0].amount)).toBe(500);

      // Webhook processed
      const webhook = await db('webhook_events').where({ id: webhookEventId }).first();
      expect(webhook.status).toBe('processed');
    });

    it('should fallback to payment.amount when amount_refunded is not provided', async () => {
      await db('payments').where({ id: paymentId }).update({ status: 'succeeded' });
      await db('accounts').where({ id: accountId }).update({ balance: 1000 });

      const webhookEventId = randomUUID();
      await insertWebhookEvent(webhookEventId, 'charge.refunded');

      const job = createWebhookJob(webhookEventId, 'charge.refunded');
      await processor.processPaymentWebhook(job);

      // Full amount refunded (payment.amount = 1000)
      const account = await db('accounts').where({ id: accountId }).first();
      expect(parseFloat(account.balance)).toBe(2000);
    });
  });

  // ============================================
  // Atomicity (transaction rollback)
  // ============================================

  describe('atomicity', () => {
    it('should rollback all changes on error mid-processing', async () => {
      const webhookEventId = randomUUID();
      await insertWebhookEvent(webhookEventId, 'payment_intent.succeeded');

      // Use a payment ID that doesn't exist to trigger error after webhook is marked processing
      const job = createWebhookJob(webhookEventId, 'payment_intent.succeeded', {
        data: {
          object: {
            metadata: { payment_id: randomUUID() }, // non-existent payment
          },
        },
      });

      await expect(processor.processPaymentWebhook(job)).rejects.toThrow('not found');

      // Balance unchanged (was 0)
      const account = await db('accounts').where({ id: accountId }).first();
      expect(parseFloat(account.balance)).toBe(0);

      // Payment status unchanged (was processing)
      const payment = await db('payments').where({ id: paymentId }).first();
      expect(payment.status).toBe('processing');

      // Webhook marked as failed (outside the rolled-back transaction)
      const webhook = await db('webhook_events').where({ id: webhookEventId }).first();
      expect(webhook.status).toBe('failed');
      expect(webhook.error_message).toContain('not found');
      expect(webhook.retry_count).toBe(1);
    });
  });

  // ============================================
  // Error handling
  // ============================================

  describe('error handling', () => {
    it('should mark webhook as FAILED and increment retry_count on missing payment_id', async () => {
      const webhookEventId = randomUUID();
      await insertWebhookEvent(webhookEventId, 'payment_intent.succeeded');

      const job = createWebhookJob(webhookEventId, 'payment_intent.succeeded', {
        data: {
          object: {
            metadata: {}, // no payment_id
          },
        },
      });

      await expect(processor.processPaymentWebhook(job)).rejects.toThrow(
        'payment_id not found',
      );

      const webhook = await db('webhook_events').where({ id: webhookEventId }).first();
      expect(webhook.status).toBe('failed');
      expect(webhook.retry_count).toBe(1);
      expect(webhook.error_message).toContain('payment_id not found');
    });
  });
});
