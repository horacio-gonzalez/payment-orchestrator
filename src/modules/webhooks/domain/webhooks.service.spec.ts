import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { IWebhookEventsRepository } from './i-webhook-events.repository';
import { WebhookEvent } from './webhook-event.entity';
import {
  WebhookEventStatus,
  WebhookProvider,
} from './webhook-event.types';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let webhookEventsRepository: Record<string, jest.Mock>;

  beforeEach(async () => {
    webhookEventsRepository = {
      findById: jest.fn(),
      findByExternalId: jest.fn(),
      create: jest.fn(),
      updateStatus: jest.fn(),
      findPendingForRetry: jest.fn(),
      incrementRetryCount: jest.fn(),
      updatePaymentAssociation: jest.fn(),
      updateError: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: IWebhookEventsRepository,
          useValue: webhookEventsRepository,
        },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  describe('createEvent', () => {
    it('should create a webhook event with correct data and return it', async () => {
      const data = {
        externalId: 'evt_123',
        provider: WebhookProvider.STRIPE,
        eventType: 'payment_intent.succeeded',
        payload: { id: 'pi_123', amount: 1000 },
        paymentId: 'pay-1',
      };

      const createdEvent = new WebhookEvent({
        id: 'wh-1',
        externalId: data.externalId,
        provider: data.provider,
        eventType: data.eventType,
        payload: data.payload,
        status: WebhookEventStatus.PENDING,
        paymentId: data.paymentId,
        errorMessage: null,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        processedAt: null,
      });

      webhookEventsRepository.create.mockResolvedValue(createdEvent);

      const result = await service.createEvent(data);

      expect(webhookEventsRepository.create).toHaveBeenCalledTimes(1);
      const calledWith = webhookEventsRepository.create.mock
        .calls[0][0] as WebhookEvent;
      expect(calledWith).toBeInstanceOf(WebhookEvent);
      expect(calledWith.externalId).toBe(data.externalId);
      expect(calledWith.provider).toBe(data.provider);
      expect(calledWith.eventType).toBe(data.eventType);
      expect(calledWith.payload).toEqual(data.payload);
      expect(calledWith.status).toBe(WebhookEventStatus.PENDING);
      expect(calledWith.paymentId).toBe(data.paymentId);
      expect(calledWith.errorMessage).toBeNull();
      expect(calledWith.retryCount).toBe(0);
      expect(calledWith.processedAt).toBeNull();
      expect(result).toBe(createdEvent);
    });

    it('should default paymentId to null when not provided', async () => {
      const data = {
        externalId: 'evt_456',
        provider: WebhookProvider.PAYPAL,
        eventType: 'PAYMENT.CAPTURE.COMPLETED',
        payload: { id: 'CAP-123' },
      };

      webhookEventsRepository.create.mockResolvedValue(new WebhookEvent({}));

      await service.createEvent(data);

      const calledWith = webhookEventsRepository.create.mock
        .calls[0][0] as WebhookEvent;
      expect(calledWith.paymentId).toBeNull();
    });
  });

  describe('findById', () => {
    it('should return the webhook event when found', async () => {
      const event = new WebhookEvent({
        id: 'wh-1',
        externalId: 'evt_123',
        status: WebhookEventStatus.PENDING,
      });

      webhookEventsRepository.findById.mockResolvedValue(event);

      const result = await service.findById('wh-1');

      expect(webhookEventsRepository.findById).toHaveBeenCalledWith('wh-1');
      expect(result).toBe(event);
    });

    it('should throw NotFoundException when webhook event is not found', async () => {
      webhookEventsRepository.findById.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByExternalId', () => {
    it('should delegate to repository', async () => {
      const event = new WebhookEvent({
        id: 'wh-1',
        externalId: 'evt_123',
      });

      webhookEventsRepository.findByExternalId.mockResolvedValue(event);

      const result = await service.findByExternalId('evt_123');

      expect(webhookEventsRepository.findByExternalId).toHaveBeenCalledWith(
        'evt_123',
      );
      expect(result).toBe(event);
    });

    it('should return null when not found', async () => {
      webhookEventsRepository.findByExternalId.mockResolvedValue(null);

      const result = await service.findByExternalId('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should delegate to repository without transaction', async () => {
      webhookEventsRepository.updateStatus.mockResolvedValue(undefined);

      await service.updateStatus('wh-1', WebhookEventStatus.PROCESSED);

      expect(webhookEventsRepository.updateStatus).toHaveBeenCalledWith(
        'wh-1',
        WebhookEventStatus.PROCESSED,
        undefined,
      );
    });

    it('should delegate to repository with transaction', async () => {
      const mockTrx = {} as any;
      webhookEventsRepository.updateStatus.mockResolvedValue(undefined);

      await service.updateStatus(
        'wh-1',
        WebhookEventStatus.PROCESSING,
        mockTrx,
      );

      expect(webhookEventsRepository.updateStatus).toHaveBeenCalledWith(
        'wh-1',
        WebhookEventStatus.PROCESSING,
        mockTrx,
      );
    });
  });

  describe('getPendingForRetry', () => {
    it('should delegate to repository with limit', async () => {
      const events = [
        new WebhookEvent({ id: 'wh-1', status: WebhookEventStatus.PENDING }),
        new WebhookEvent({ id: 'wh-2', status: WebhookEventStatus.PENDING }),
      ];

      webhookEventsRepository.findPendingForRetry.mockResolvedValue(events);

      const result = await service.getPendingForRetry(10);

      expect(webhookEventsRepository.findPendingForRetry).toHaveBeenCalledWith(
        10,
      );
      expect(result).toBe(events);
    });

    it('should delegate to repository without limit', async () => {
      webhookEventsRepository.findPendingForRetry.mockResolvedValue([]);

      const result = await service.getPendingForRetry();

      expect(webhookEventsRepository.findPendingForRetry).toHaveBeenCalledWith(
        undefined,
      );
      expect(result).toEqual([]);
    });
  });
});
