import { Module } from '@nestjs/common';
import { WebhooksController } from './api/webhooks.controller';
import { WebhooksService } from './domain/webhooks.service';
import { IWebhookEventsRepository } from './domain/i-webhook-events.repository';
import { WebhookEventsRepository } from './infrastructure/webhook-events.repository';

@Module({
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    {
      provide: IWebhookEventsRepository,
      useClass: WebhookEventsRepository,
    },
  ],
  exports: [WebhooksService, IWebhookEventsRepository],
})
export class WebhooksModule { }
