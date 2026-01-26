import { Injectable } from '@nestjs/common';
import { IWebhookEventsRepository } from './i-webhook-events.repository';

@Injectable()
export class WebhooksService {
  constructor(private readonly webhookEventsRepository: IWebhookEventsRepository) { }
}
