import { WebhookEvent } from './webhook-event.entity';
import { WebhookEventStatus, WebhookProvider } from './webhook-event.types';

describe('WebhookEvent Entity', () => {
  const baseData = {
    id: 'wh_123',
    externalId: 'evt_stripe_456',
    provider: WebhookProvider.STRIPE,
    eventType: 'payment_intent.succeeded',
    payload: { amount: 1000 },
    status: WebhookEventStatus.PENDING,
    paymentId: 'pay_789',
    errorMessage: null,
    retryCount: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    processedAt: null,
  };

  describe('constructor', () => {
    it('should assign all properties from data', () => {
      const event = new WebhookEvent(baseData);

      expect(event.id).toBe('wh_123');
      expect(event.externalId).toBe('evt_stripe_456');
      expect(event.provider).toBe(WebhookProvider.STRIPE);
      expect(event.eventType).toBe('payment_intent.succeeded');
      expect(event.payload).toEqual({ amount: 1000 });
      expect(event.status).toBe(WebhookEventStatus.PENDING);
      expect(event.paymentId).toBe('pay_789');
      expect(event.errorMessage).toBeNull();
      expect(event.retryCount).toBe(0);
    });
  });

  describe('isProcessed', () => {
    it('should return true when status is PROCESSED', () => {
      const event = new WebhookEvent({ ...baseData, status: WebhookEventStatus.PROCESSED });
      expect(event.isProcessed()).toBe(true);
    });

    it('should return false for other statuses', () => {
      const event = new WebhookEvent({ ...baseData, status: WebhookEventStatus.PENDING });
      expect(event.isProcessed()).toBe(false);
    });
  });

  describe('isDuplicate', () => {
    it('should return true when status is DUPLICATE', () => {
      const event = new WebhookEvent({ ...baseData, status: WebhookEventStatus.DUPLICATE });
      expect(event.isDuplicate()).toBe(true);
    });

    it('should return false for other statuses', () => {
      const event = new WebhookEvent({ ...baseData, status: WebhookEventStatus.PROCESSED });
      expect(event.isDuplicate()).toBe(false);
    });
  });

  describe('isFailed', () => {
    it('should return true when status is FAILED', () => {
      const event = new WebhookEvent({ ...baseData, status: WebhookEventStatus.FAILED });
      expect(event.isFailed()).toBe(true);
    });

    it('should return false for other statuses', () => {
      const event = new WebhookEvent({ ...baseData, status: WebhookEventStatus.PENDING });
      expect(event.isFailed()).toBe(false);
    });
  });

  describe('isPending', () => {
    it('should return true when status is PENDING', () => {
      const event = new WebhookEvent({ ...baseData, status: WebhookEventStatus.PENDING });
      expect(event.isPending()).toBe(true);
    });

    it('should return false for other statuses', () => {
      const event = new WebhookEvent({ ...baseData, status: WebhookEventStatus.PROCESSING });
      expect(event.isPending()).toBe(false);
    });
  });

  describe('isProcessing', () => {
    it('should return true when status is PROCESSING', () => {
      const event = new WebhookEvent({ ...baseData, status: WebhookEventStatus.PROCESSING });
      expect(event.isProcessing()).toBe(true);
    });

    it('should return false for other statuses', () => {
      const event = new WebhookEvent({ ...baseData, status: WebhookEventStatus.PENDING });
      expect(event.isProcessing()).toBe(false);
    });
  });

  describe('canRetry', () => {
    it('should return true when failed and retryCount < 3', () => {
      const event = new WebhookEvent({
        ...baseData,
        status: WebhookEventStatus.FAILED,
        retryCount: 0,
      });
      expect(event.canRetry()).toBe(true);
    });

    it('should return true when failed and retryCount is 2', () => {
      const event = new WebhookEvent({
        ...baseData,
        status: WebhookEventStatus.FAILED,
        retryCount: 2,
      });
      expect(event.canRetry()).toBe(true);
    });

    it('should return false when failed and retryCount is 3', () => {
      const event = new WebhookEvent({
        ...baseData,
        status: WebhookEventStatus.FAILED,
        retryCount: 3,
      });
      expect(event.canRetry()).toBe(false);
    });

    it('should return false when failed and retryCount exceeds 3', () => {
      const event = new WebhookEvent({
        ...baseData,
        status: WebhookEventStatus.FAILED,
        retryCount: 5,
      });
      expect(event.canRetry()).toBe(false);
    });

    it('should return false when not failed even with low retryCount', () => {
      const event = new WebhookEvent({
        ...baseData,
        status: WebhookEventStatus.PENDING,
        retryCount: 0,
      });
      expect(event.canRetry()).toBe(false);
    });

    it('should return false when processed', () => {
      const event = new WebhookEvent({
        ...baseData,
        status: WebhookEventStatus.PROCESSED,
        retryCount: 1,
      });
      expect(event.canRetry()).toBe(false);
    });
  });
});
