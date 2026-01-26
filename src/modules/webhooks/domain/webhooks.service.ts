import { Injectable } from '@nestjs/common';
import { WebhookEventsRepository } from '../infrastructure/webhook-events.repository';

@Injectable()
export class WebhooksService {
  constructor(private readonly webhookEventsRepository: WebhookEventsRepository) { }

  public create() {
    this.webhookEventsRepository.findByExternalId("");
  }
}
