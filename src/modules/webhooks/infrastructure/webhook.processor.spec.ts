import { Test, TestingModule } from '@nestjs/testing';
import { WebhookProcessor } from './webhook.processor';
import { PaymentRepository } from '../../payments/infrastructure/payment.repository';
import { AccountsService } from '../../accounts/domain/accounts.service';
import { TransactionsService } from '../../transactions/domain/transactions.service';
import { IWebhookEventsRepository } from '../domain/i-webhook-events.repository';
import { PaymentStatus } from '../../payments/domain/payment.types';
import { WebhookEventStatus } from '../domain/webhook-event.types';
import { Payment } from '../../payments/domain/payment.entity';
import { Job } from 'bull';

describe('WebhookProcessor', () => {
  let processor: WebhookProcessor;
  let mockTrx: any;
  let mockKnex: any;
  let mockPaymentRepository: jest.Mocked<PaymentRepository>;
  let mockAccountsService: jest.Mocked<AccountsService>;
  let mockTransactionsService: jest.Mocked<TransactionsService>;
  let mockWebhookEventsRepository: jest.Mocked<IWebhookEventsRepository>;

  const webhookEventId = 'wh_evt_123';
  const paymentId = 'pay_456';
  const accountId = 'acc_789';

  const mockPayment = new Payment({
    id: paymentId,
    accountId,
    amount: 50.0,
    currency: 'usd',
    status: PaymentStatus.PROCESSING,
    provider: 'stripe',
    externalPaymentId: 'pi_stripe_123',
    paymentMethod: 'card',
    description: null,
    metadata: {},
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    processedAt: null,
  });

  const createJob = (type: string, overrides: Record<string, any> = {}): Job => {
    const basePayload = {
      id: 'evt_stripe_abc',
      object: 'event',
      api_version: '2023-10-16',
      created: 1700000000,
      data: {
        object: {
          id: 'pi_stripe_123',
          object: 'payment_intent',
          amount: 5000,
          currency: 'usd',
          status: 'succeeded',
          metadata: { payment_id: paymentId },
          ...overrides,
        },
      },
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      type,
    };

    return {
      id: 'job_1',
      data: {
        webhookEventId,
        payload: basePayload,
      },
    } as unknown as Job;
  };

  beforeEach(async () => {
    mockTrx = {};

    mockKnex = {
      transaction: jest.fn((callback) => callback(mockTrx)),
    };

    mockPaymentRepository = {
      findByIdForUpdate: jest.fn(),
      updateStatus: jest.fn(),
      findById: jest.fn(),
      findByExternalPaymentId: jest.fn(),
      findByAccountId: jest.fn(),
      create: jest.fn(),
    } as any;

    mockAccountsService = {
      creditFunds: jest.fn(),
    } as any;

    mockTransactionsService = {
      recordCredit: jest.fn(),
    } as any;

    mockWebhookEventsRepository = {
      updateStatus: jest.fn(),
      updatePaymentAssociation: jest.fn(),
      updateError: jest.fn(),
      incrementRetryCount: jest.fn(),
      findById: jest.fn(),
      findByExternalId: jest.fn(),
      create: jest.fn(),
      findPendingForRetry: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookProcessor,
        { provide: 'KNEX', useValue: mockKnex },
        { provide: PaymentRepository, useValue: mockPaymentRepository },
        { provide: AccountsService, useValue: mockAccountsService },
        { provide: TransactionsService, useValue: mockTransactionsService },
        { provide: IWebhookEventsRepository, useValue: mockWebhookEventsRepository },
      ],
    }).compile();

    processor = module.get<WebhookProcessor>(WebhookProcessor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processPaymentWebhook - payment_intent.succeeded', () => {
    it('should process a successful payment webhook end-to-end', async () => {
      const job = createJob('payment_intent.succeeded');
      mockPaymentRepository.findByIdForUpdate.mockResolvedValue(mockPayment);

      await processor.processPaymentWebhook(job);

      // Verify transaction was started
      expect(mockKnex.transaction).toHaveBeenCalledTimes(1);

      // Verify webhook marked as PROCESSING
      expect(mockWebhookEventsRepository.updateStatus).toHaveBeenCalledWith(
        webhookEventId,
        WebhookEventStatus.PROCESSING,
        mockTrx,
      );

      // Verify payment locked and found
      expect(mockPaymentRepository.findByIdForUpdate).toHaveBeenCalledWith(paymentId, mockTrx);

      // Verify payment status updated to SUCCEEDED
      expect(mockPaymentRepository.updateStatus).toHaveBeenCalledWith(
        paymentId,
        PaymentStatus.SUCCEEDED,
        mockTrx,
      );

      // Verify account credited
      expect(mockAccountsService.creditFunds).toHaveBeenCalledWith(
        accountId,
        mockPayment.amount,
        mockTrx,
      );

      // Verify transaction recorded
      expect(mockTransactionsService.recordCredit).toHaveBeenCalledWith(
        accountId,
        mockPayment.amount,
        paymentId,
        'payment',
        mockTrx,
        `Payment ${paymentId} succeeded`,
      );

      // Verify webhook-payment association
      expect(mockWebhookEventsRepository.updatePaymentAssociation).toHaveBeenCalledWith(
        webhookEventId,
        paymentId,
        mockTrx,
      );

      // Verify webhook marked as PROCESSED
      expect(mockWebhookEventsRepository.updateStatus).toHaveBeenCalledWith(
        webhookEventId,
        WebhookEventStatus.PROCESSED,
        mockTrx,
      );
    });

    it('should call steps in the correct order', async () => {
      const job = createJob('payment_intent.succeeded');
      mockPaymentRepository.findByIdForUpdate.mockResolvedValue(mockPayment);

      const callOrder: string[] = [];
      mockWebhookEventsRepository.updateStatus.mockImplementation(async (_id, status) => {
        callOrder.push(`webhook_status_${status}`);
      });
      mockPaymentRepository.findByIdForUpdate.mockImplementation(async () => {
        callOrder.push('find_payment');
        return mockPayment;
      });
      mockPaymentRepository.updateStatus.mockImplementation(async () => {
        callOrder.push('update_payment_status');
      });
      mockAccountsService.creditFunds.mockImplementation(async () => {
        callOrder.push('credit_funds');
      });
      mockTransactionsService.recordCredit.mockImplementation(async () => {
        callOrder.push('record_credit');
        return {} as any;
      });
      mockWebhookEventsRepository.updatePaymentAssociation.mockImplementation(async () => {
        callOrder.push('update_payment_association');
      });

      await processor.processPaymentWebhook(job);

      expect(callOrder).toEqual([
        'webhook_status_processing',
        'find_payment',
        'update_payment_status',
        'credit_funds',
        'record_credit',
        'update_payment_association',
        'webhook_status_processed',
      ]);
    });
  });

  describe('processPaymentWebhook - payment_intent.payment_failed', () => {
    it('should mark payment as failed', async () => {
      const job = createJob('payment_intent.payment_failed');
      mockPaymentRepository.findByIdForUpdate.mockResolvedValue(mockPayment);

      await processor.processPaymentWebhook(job);

      expect(mockKnex.transaction).toHaveBeenCalledTimes(1);

      expect(mockWebhookEventsRepository.updateStatus).toHaveBeenCalledWith(
        webhookEventId,
        WebhookEventStatus.PROCESSING,
        mockTrx,
      );

      expect(mockPaymentRepository.findByIdForUpdate).toHaveBeenCalledWith(paymentId, mockTrx);

      expect(mockPaymentRepository.updateStatus).toHaveBeenCalledWith(
        paymentId,
        PaymentStatus.FAILED,
        mockTrx,
      );

      expect(mockWebhookEventsRepository.updatePaymentAssociation).toHaveBeenCalledWith(
        webhookEventId,
        paymentId,
        mockTrx,
      );

      expect(mockWebhookEventsRepository.updateStatus).toHaveBeenCalledWith(
        webhookEventId,
        WebhookEventStatus.PROCESSED,
        mockTrx,
      );

      // Should NOT credit funds or record transaction
      expect(mockAccountsService.creditFunds).not.toHaveBeenCalled();
      expect(mockTransactionsService.recordCredit).not.toHaveBeenCalled();
    });
  });

  describe('processPaymentWebhook - charge.refunded', () => {
    it('should process refund with amount_refunded from dto (cents conversion)', async () => {
      const job = createJob('charge.refunded', { amount_refunded: 3000 });
      mockPaymentRepository.findByIdForUpdate.mockResolvedValue(mockPayment);

      await processor.processPaymentWebhook(job);

      expect(mockPaymentRepository.findByIdForUpdate).toHaveBeenCalledWith(paymentId, mockTrx);

      expect(mockPaymentRepository.updateStatus).toHaveBeenCalledWith(
        paymentId,
        PaymentStatus.REFUNDED,
        mockTrx,
      );

      // amount_refunded / 100 = 3000 / 100 = 30
      expect(mockAccountsService.creditFunds).toHaveBeenCalledWith(accountId, 30, mockTrx);

      expect(mockTransactionsService.recordCredit).toHaveBeenCalledWith(
        accountId,
        30,
        paymentId,
        'refund',
        mockTrx,
        `Refund for payment ${paymentId}`,
      );

      expect(mockWebhookEventsRepository.updatePaymentAssociation).toHaveBeenCalledWith(
        webhookEventId,
        paymentId,
        mockTrx,
      );
    });

    it('should use payment.amount when amount_refunded is not provided', async () => {
      const job = createJob('charge.refunded', { amount_refunded: undefined });
      mockPaymentRepository.findByIdForUpdate.mockResolvedValue(mockPayment);

      await processor.processPaymentWebhook(job);

      // Falls back to payment.amount
      expect(mockAccountsService.creditFunds).toHaveBeenCalledWith(
        accountId,
        mockPayment.amount,
        mockTrx,
      );

      expect(mockTransactionsService.recordCredit).toHaveBeenCalledWith(
        accountId,
        mockPayment.amount,
        paymentId,
        'refund',
        mockTrx,
        `Refund for payment ${paymentId}`,
      );
    });
  });

  describe('error handling - missing payment_id', () => {
    it('should throw error when payment_id is missing from metadata (succeeded)', async () => {
      const job = createJob('payment_intent.succeeded', { metadata: {} });

      await expect(processor.processPaymentWebhook(job)).rejects.toThrow(
        'payment_id not found in webhook metadata',
      );

      // Error handling outside the transaction
      expect(mockWebhookEventsRepository.updateStatus).toHaveBeenCalledWith(
        webhookEventId,
        WebhookEventStatus.FAILED,
      );
      expect(mockWebhookEventsRepository.updateError).toHaveBeenCalledWith(
        webhookEventId,
        'payment_id not found in webhook metadata',
      );
      expect(mockWebhookEventsRepository.incrementRetryCount).toHaveBeenCalledWith(webhookEventId);
    });

    it('should throw error when payment_id is missing from metadata (failed)', async () => {
      const job = createJob('payment_intent.payment_failed', { metadata: {} });

      await expect(processor.processPaymentWebhook(job)).rejects.toThrow(
        'payment_id not found in webhook metadata',
      );
    });

    it('should throw error when payment_id is missing from metadata (refunded)', async () => {
      const job = createJob('charge.refunded', { metadata: {} });

      await expect(processor.processPaymentWebhook(job)).rejects.toThrow(
        'payment_id not found in webhook metadata',
      );
    });
  });

  describe('error handling - payment not found', () => {
    it('should throw error when payment does not exist', async () => {
      const job = createJob('payment_intent.succeeded');
      mockPaymentRepository.findByIdForUpdate.mockResolvedValue(null);

      await expect(processor.processPaymentWebhook(job)).rejects.toThrow(
        `Payment ${paymentId} not found`,
      );

      expect(mockWebhookEventsRepository.updateStatus).toHaveBeenCalledWith(
        webhookEventId,
        WebhookEventStatus.FAILED,
      );
      expect(mockWebhookEventsRepository.updateError).toHaveBeenCalledWith(
        webhookEventId,
        `Payment ${paymentId} not found`,
      );
      expect(mockWebhookEventsRepository.incrementRetryCount).toHaveBeenCalledWith(webhookEventId);
    });
  });

  describe('error handling - general failure', () => {
    it('should mark webhook as FAILED, update error, and increment retry on exception', async () => {
      const job = createJob('payment_intent.succeeded');
      mockPaymentRepository.findByIdForUpdate.mockResolvedValue(mockPayment);
      mockAccountsService.creditFunds.mockRejectedValue(new Error('Database connection lost'));

      await expect(processor.processPaymentWebhook(job)).rejects.toThrow(
        'Database connection lost',
      );

      expect(mockWebhookEventsRepository.updateStatus).toHaveBeenCalledWith(
        webhookEventId,
        WebhookEventStatus.FAILED,
      );
      expect(mockWebhookEventsRepository.updateError).toHaveBeenCalledWith(
        webhookEventId,
        'Database connection lost',
      );
      expect(mockWebhookEventsRepository.incrementRetryCount).toHaveBeenCalledWith(webhookEventId);
    });

    it('should still throw the original error even if error status update fails', async () => {
      const job = createJob('payment_intent.succeeded');
      mockPaymentRepository.findByIdForUpdate.mockResolvedValue(null);
      mockWebhookEventsRepository.updateStatus.mockImplementation(async (_id, status) => {
        // Allow PROCESSING call inside transaction, but fail the FAILED call outside
        if (status === WebhookEventStatus.FAILED) {
          throw new Error('Redis unavailable');
        }
      });

      await expect(processor.processPaymentWebhook(job)).rejects.toThrow(
        `Payment ${paymentId} not found`,
      );
    });
  });

  describe('unhandled webhook type', () => {
    it('should not throw for unrecognized event types', async () => {
      const job = createJob('customer.created');

      await expect(processor.processPaymentWebhook(job)).resolves.toBeUndefined();

      // Should still mark as processing and processed
      expect(mockWebhookEventsRepository.updateStatus).toHaveBeenCalledWith(
        webhookEventId,
        WebhookEventStatus.PROCESSING,
        mockTrx,
      );
      expect(mockWebhookEventsRepository.updateStatus).toHaveBeenCalledWith(
        webhookEventId,
        WebhookEventStatus.PROCESSED,
        mockTrx,
      );
    });
  });
});
