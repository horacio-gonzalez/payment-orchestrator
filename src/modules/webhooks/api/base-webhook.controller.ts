import { Logger } from '@nestjs/common';
import { WebhookIdempotencyService } from '../domain/webhook-idempotency.service';
import { IWebhookEventsRepository } from '../domain/i-webhook-events.repository';
import { WebhookProvider } from '../domain/webhook-event.types';
import { WebhookReceivedResponseDto } from '../domain/dto/webhook-response.dto';
import { WebhookEvent } from '../domain/webhook-event.entity';

export abstract class BaseWebhookController {
  protected abstract readonly logger: Logger;

  constructor(
    protected readonly idempotencyService: WebhookIdempotencyService,
    protected readonly webhookRepo: IWebhookEventsRepository,
  ) { }

  protected async handleWebhook(
    externalId: string,
    provider: WebhookProvider,
    eventType: string,
    payload: Record<string, any>,
    processCallback: (
      webhookEvent: WebhookEvent,
    ) => Promise<{ webhookId: string }>,
  ): Promise<WebhookReceivedResponseDto> {
    this.logger.log(
      `Received webhook: ${externalId} (provider: ${provider}, type: ${eventType})`,
    );

    // 1. Idempotency check (Defense in Depth: Redis + DB)
    const { isNew, existingWebhookId } =
      await this.idempotencyService.checkAndStore(externalId, provider);

    if (!isNew) {
      this.logger.debug(
        `Webhook ${externalId} is a duplicate, returning early`,
      );
      return {
        received: true,
        duplicate: true,
        webhookId: existingWebhookId!,
        message: 'Webhook already processed',
      };
    }

    try {
      // 2. Execute provider-specific processing logic
      const { webhookId } = await processCallback(null as any);

      // 3. Mark as processed in Redis cache
      await this.idempotencyService.markAsProcessed(externalId, webhookId);

      this.logger.log(`Webhook ${externalId} processed successfully`);

      return {
        received: true,
        webhookId,
        message: 'Webhook received and queued for processing',
      };
    } catch (error) {
      this.logger.error(
        `Error processing webhook ${externalId}:`,
        error.stack,
      );
      throw error;
    }
  }

  protected buildWebhookEvent(
    externalId: string,
    provider: WebhookProvider,
    eventType: string,
    payload: Record<string, any>,
  ): Partial<WebhookEvent> {
    return {
      externalId,
      provider,
      eventType,
      payload,
      status: 'pending' as any,
      paymentId: null,
      errorMessage: null,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      processedAt: null,
    };
  }
}
