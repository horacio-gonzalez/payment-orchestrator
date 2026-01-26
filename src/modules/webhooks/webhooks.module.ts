import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { StripeWebhooksController } from './api/stripe-webhooks.controller';
import { WebhooksService } from './domain/webhooks.service';
import { IWebhookEventsRepository } from './domain/i-webhook-events.repository';
import { WebhookEventsRepository } from './infrastructure/webhook-events.repository';
import { WebhookIdempotencyService } from './domain/webhook-idempotency.service';
import { WebhookProcessor } from './infrastructure/webhook.processor';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    PaymentsModule,
    BullModule.registerQueue({
      name: 'webhook-processing',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }),
    BullBoardModule.forFeature({
      name: 'webhook-processing',
      adapter: BullAdapter,
    }),
  ],
  controllers: [StripeWebhooksController],
  providers: [
    WebhooksService,
    {
      provide: IWebhookEventsRepository,
      useClass: WebhookEventsRepository,
    },
    WebhookIdempotencyService,
    WebhookProcessor,
  ],
  exports: [
    WebhooksService,
    IWebhookEventsRepository,
    WebhookIdempotencyService,
  ],
})
export class WebhooksModule { }
