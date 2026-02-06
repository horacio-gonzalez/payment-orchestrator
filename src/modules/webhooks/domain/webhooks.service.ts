import { Injectable, NotFoundException } from '@nestjs/common';
import { Knex } from 'knex';
import { IWebhookEventsRepository } from './i-webhook-events.repository';
import { WebhookEvent } from './webhook-event.entity';
import { WebhookEventStatus, CreateWebhookEventData } from './webhook-event.types';
import { randomUUID } from 'crypto';

@Injectable()
export class WebhooksService {
  constructor(private readonly webhookEventsRepository: IWebhookEventsRepository) { }

  async createEvent(data: CreateWebhookEventData): Promise<WebhookEvent> {
    const event = new WebhookEvent({
      id: randomUUID(),
      externalId: data.externalId,
      provider: data.provider,
      eventType: data.eventType,
      payload: data.payload,
      status: WebhookEventStatus.PENDING,
      paymentId: data.paymentId ?? null,
      errorMessage: null,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      processedAt: null,
    });

    return this.webhookEventsRepository.create(event);
  }

  async findById(id: string): Promise<WebhookEvent> {
    const event = await this.webhookEventsRepository.findById(id);
    if (!event) {
      throw new NotFoundException(`Webhook event ${id} not found`);
    }
    return event;
  }

  async findByExternalId(externalId: string): Promise<WebhookEvent | null> {
    return this.webhookEventsRepository.findByExternalId(externalId);
  }

  async updateStatus(id: string, status: WebhookEventStatus, trx?: Knex.Transaction): Promise<void> {
    return this.webhookEventsRepository.updateStatus(id, status, trx);
  }

  async getPendingForRetry(limit?: number): Promise<WebhookEvent[]> {
    return this.webhookEventsRepository.findPendingForRetry(limit);
  }
}
