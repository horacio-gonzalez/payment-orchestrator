import { Module } from '@nestjs/common';
import { StripeWebhooksController } from './api/stripe-webhooks.controller';
import { WebhooksService } from './domain/webhooks.service';
import { IWebhookEventsRepository } from './domain/i-webhook-events.repository';
import { WebhookEventsRepository } from './infrastructure/webhook-events.repository';
import { WebhookIdempotencyService } from './domain/webhook-idempotency.service';

@Module({
  controllers: [StripeWebhooksController],
  providers: [
    WebhooksService,
    {
      provide: IWebhookEventsRepository,
      useClass: WebhookEventsRepository,
    },
    WebhookIdempotencyService,
  ],
  exports: [
    WebhooksService,
    IWebhookEventsRepository,
    WebhookIdempotencyService,
  ],
})
export class WebhooksModule { }
