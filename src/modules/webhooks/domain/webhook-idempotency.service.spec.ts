import { Test, TestingModule } from '@nestjs/testing';
import { WebhookIdempotencyService } from './webhook-idempotency.service';
import { RedisService } from '../../../shared/redis/redis.service';
import { IWebhookEventsRepository } from './i-webhook-events.repository';
import { WebhookEvent } from './webhook-event.entity';
import { WebhookProvider, WebhookEventStatus } from './webhook-event.types';

describe('WebhookIdempotencyService', () => {
  let service: WebhookIdempotencyService;
  let mockRedis: jest.Mocked<RedisService>;
  let mockRepo: jest.Mocked<IWebhookEventsRepository>;

  beforeEach(async () => {
    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      ping: jest.fn(),
    } as any;

    mockRepo = {
      findByExternalId: jest.fn(),
      findById: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookIdempotencyService,
        { provide: RedisService, useValue: mockRedis },
        { provide: IWebhookEventsRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<WebhookIdempotencyService>(WebhookIdempotencyService);
  });

  describe('checkAndStore', () => {
    it('should return isNew: false when found in Redis cache', async () => {
      mockRedis.get.mockResolvedValue('wh-123');

      const result = await service.checkAndStore('evt_1', WebhookProvider.STRIPE);

      expect(result).toEqual({ isNew: false, existingWebhookId: 'wh-123' });
      expect(mockRepo.findByExternalId).not.toHaveBeenCalled();
    });

    it('should fallback to DB when not in Redis', async () => {
      mockRedis.get.mockResolvedValue(null);
      const event = new WebhookEvent({ id: 'wh-123', externalId: 'evt_1' });
      mockRepo.findByExternalId.mockResolvedValue(event);

      const result = await service.checkAndStore('evt_1', WebhookProvider.STRIPE);

      expect(result).toEqual({ isNew: false, existingWebhookId: 'wh-123' });
      expect(mockRedis.setex).toHaveBeenCalledWith('webhook:evt_1', 604800, 'wh-123');
    });

    it('should return isNew: true when not found anywhere', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRepo.findByExternalId.mockResolvedValue(null);

      const result = await service.checkAndStore('evt_new', WebhookProvider.STRIPE);

      expect(result).toEqual({ isNew: true });
    });
  });

  describe('markAsProcessed', () => {
    it('should store in Redis with TTL', async () => {
      await service.markAsProcessed('evt_1', 'wh-123');

      expect(mockRedis.setex).toHaveBeenCalledWith('webhook:evt_1', 604800, 'wh-123');
    });
  });

  describe('invalidate', () => {
    it('should delete from Redis', async () => {
      await service.invalidate('evt_1');

      expect(mockRedis.del).toHaveBeenCalledWith('webhook:evt_1');
    });
  });

  describe('healthCheck', () => {
    it('should report healthy when both services work', async () => {
      mockRedis.ping.mockResolvedValue(true);
      mockRepo.findById.mockResolvedValue(null);

      const result = await service.healthCheck();

      expect(result.redis).toBe(true);
      expect(result.database).toBe(true);
    });

    it('should report unhealthy Redis', async () => {
      mockRedis.ping.mockResolvedValue(false);
      mockRepo.findById.mockResolvedValue(null);

      const result = await service.healthCheck();

      expect(result.redis).toBe(false);
    });

    it('should report unhealthy database on error', async () => {
      mockRedis.ping.mockResolvedValue(true);
      mockRepo.findById.mockRejectedValue(new Error('DB down'));

      const result = await service.healthCheck();

      expect(result.database).toBe(false);
    });
  });
});
