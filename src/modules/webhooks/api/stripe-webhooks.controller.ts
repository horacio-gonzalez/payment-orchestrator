import { Controller, Post, Body } from '@nestjs/common';
import { WebhooksService } from '../domain/webhooks.service';
import { StripeWebhookDto } from '../domain/dto';

@Controller('webhooks/stripe')
export class StripeWebhooksController {
  constructor(private readonly webhooksService: WebhooksService) { }

  @Post()
  process(@Body() webhookPayload: StripeWebhookDto) {

  }
}
