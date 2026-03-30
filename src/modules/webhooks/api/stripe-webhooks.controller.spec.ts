import { Test, TestingModule } from '@nestjs/testing';
import { StripeWebhooksController } from './stripe-webhooks.controller';
import { WebhooksService } from '../domain/webhooks.service';
import { WebhookIdempotencyService } from '../domain/webhook-idempotency.service';
import { WebhookEvent } from '../domain/webhook-event.entity';
import { WebhookEventStatus, WebhookProvider } from '../domain/webhook-event.types';

describe('StripeWebhooksController', () => {
  let controller: StripeWebhooksController;
  let mockWebhooksService: jest.Mocked<WebhooksService>;
  let mockIdempotencyService: jest.Mocked<WebhookIdempotencyService>;
  let mockQueue: any;

  const stripePayload = {
    id: 'evt_123',
    object: 'event',
    api_version: '2023-10-16',
    created: Date.now(),
    type: 'payment_intent.succeeded',
    livemode: false,
    pending_webhooks: 1,
    request: { id: 'req_123', idempotency_key: null },
    data: {
      object: {
        id: 'pi_123',
        amount: 10000,
        currency: 'usd',
        status: 'succeeded',
        metadata: { payment_id: 'pay-1' },
      },
    },
  };

  beforeEach(async () => {
    mockWebhooksService = {
      createEvent: jest.fn(),
    } as any;

    mockIdempotencyService = {
      checkAndStore: jest.fn(),
      markAsProcessed: jest.fn(),
    } as any;

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeWebhooksController],
      providers: [
        { provide: WebhooksService, useValue: mockWebhooksService },
        { provide: WebhookIdempotencyService, useValue: mockIdempotencyService },
        { provide: 'BullQueue_webhook-processing', useValue: mockQueue },
      ],
    }).compile();

    controller = module.get<StripeWebhooksController>(StripeWebhooksController);
  });

  describe('process', () => {
    it('should accept new webhook and enqueue for processing', async () => {
      mockIdempotencyService.checkAndStore.mockResolvedValue({ isNew: true });
      const webhookEvent = new WebhookEvent({
        id: 'wh-1',
        externalId: 'evt_123',
        status: WebhookEventStatus.PENDING,
      });
      mockWebhooksService.createEvent.mockResolvedValue(webhookEvent);

      const result = await controller.process(stripePayload as any);

      expect(result).toEqual({ status: 'accepted', jobId: 'job-1' });
      expect(mockIdempotencyService.checkAndStore).toHaveBeenCalledWith(
        'evt_123',
        WebhookProvider.STRIPE,
      );
      expect(mockWebhooksService.createEvent).toHaveBeenCalled();
      expect(mockIdempotencyService.markAsProcessed).toHaveBeenCalledWith('evt_123', 'wh-1');
      expect(mockQueue.add).toHaveBeenCalledWith('process-payment-webhook', {
        webhookEventId: 'wh-1',
        payload: stripePayload,
      });
    });

    it('should return duplicate status for already-processed webhook', async () => {
      mockIdempotencyService.checkAndStore.mockResolvedValue({
        isNew: false,
        existingWebhookId: 'wh-existing',
      });

      const result = await controller.process(stripePayload as any);

      expect(result).toEqual({ status: 'duplicate' });
      expect(mockWebhooksService.createEvent).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });
});
