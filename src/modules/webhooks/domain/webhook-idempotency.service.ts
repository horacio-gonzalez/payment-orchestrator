import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../shared/redis/redis.service';
import { IWebhookEventsRepository } from './i-webhook-events.repository';
import { WebhookProvider } from './webhook-event.types';

export interface IdempotencyCheckResult {
  isNew: boolean;
  existingWebhookId?: string;
}

@Injectable()
export class WebhookIdempotencyService {
  private readonly logger = new Logger(WebhookIdempotencyService.name);
  private readonly WEBHOOK_TTL = 604800; // 7 días en segundos

  constructor(
    private readonly redis: RedisService,
    private readonly webhookRepo: IWebhookEventsRepository,
  ) { }

  async checkAndStore(
    externalId: string,
    provider: WebhookProvider,
  ): Promise<IdempotencyCheckResult> {
    const cacheKey = this.buildCacheKey(externalId);

    // FAST PATH: Check Redis cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.debug(
        `Webhook ${externalId} found in Redis cache (duplicate)`,
      );
      return {
        isNew: false,
        existingWebhookId: cached,
      };
    }

    // SLOW PATH: Check database
    const existing = await this.webhookRepo.findByExternalId(externalId);
    if (existing) {
      this.logger.debug(
        `Webhook ${externalId} found in database but not in cache (cache miss)`,
      );

      // Repopulate cache
      await this.redis.setex(cacheKey, this.WEBHOOK_TTL, existing.id);

      return {
        isNew: false,
        existingWebhookId: existing.id,
      };
    }

    // Es nuevo
    this.logger.debug(`Webhook ${externalId} is new`);
    return { isNew: true };
  }

  async markAsProcessed(
    externalId: string,
    webhookId: string,
  ): Promise<void> {
    const cacheKey = this.buildCacheKey(externalId);

    // Guardar en Redis con TTL de 7 días
    await this.redis.setex(cacheKey, this.WEBHOOK_TTL, webhookId);

    this.logger.debug(
      `Webhook ${externalId} marked as processed in Redis cache`,
    );
  }

  async invalidate(externalId: string): Promise<void> {
    const cacheKey = this.buildCacheKey(externalId);
    await this.redis.del(cacheKey);

    this.logger.debug(`Webhook ${externalId} cache invalidated`);
  }

  private buildCacheKey(externalId: string): string {
    return `webhook:${externalId}`;
  }

  async healthCheck(): Promise<{
    redis: boolean;
    database: boolean;
  }> {
    const redisHealthy = await this.redis.ping();

    // Simple DB health check
    let databaseHealthy = false;
    try {
      await this.webhookRepo.findById('health-check-id');
      databaseHealthy = true;
    } catch (error) {
      this.logger.error('Database health check failed:', error);
    }

    return {
      redis: redisHealthy,
      database: databaseHealthy,
    };
  }
}
