import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { WebhooksService } from '../domain/webhooks.service';
import { WebhookIdempotencyService } from '../domain/webhook-idempotency.service';
import { StripeWebhookDto } from '../domain/dto';
import { WebhookProvider } from '../domain/webhook-event.types';

@Controller('webhooks/stripe')
export class StripeWebhooksController {
  private readonly logger = new Logger(StripeWebhooksController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly idempotencyService: WebhookIdempotencyService,
    @InjectQueue('webhook-processing') private readonly webhookQueue: Queue,
  ) { }

  @Post()
  @HttpCode(HttpStatus.OK)
  async process(@Body() webhookPayload: StripeWebhookDto) {
    const externalId = webhookPayload.id;

    // Fast path: Check idempotency (Redis + DB)
    const result = await this.idempotencyService.checkAndStore(
      externalId,
      WebhookProvider.STRIPE,
    );

    if (!result.isNew) {
      this.logger.log(`Duplicate webhook detected: ${externalId}`);
      return { status: 'duplicate' };
    }

    // Enqueue for async processing
    const job = await this.webhookQueue.add('process-payment-webhook', {
      webhookEventId: externalId,
      payload: webhookPayload,
    });

    this.logger.log(`Webhook ${externalId} enqueued with job ID ${job.id}`);

    return { status: 'accepted', jobId: job.id };
  }
}
