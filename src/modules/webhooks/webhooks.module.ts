import { Module } from '@nestjs/common';
import { WebhooksController } from './api/webhooks.controller';
import { WebhooksService } from './domain/webhooks.service';

@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
