import { Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { IWebhookEventsRepository } from '../domain/i-webhook-events.repository';
import { WebhookEvent } from '../domain/webhook-event.entity';
import { WebhookEventStatus } from '../domain/webhook-event.types';
import {
  WebhookEventMapper,
  WebhookEventRow,
} from './webhook-event.mapper';

@Injectable()
export class WebhookEventsRepository implements IWebhookEventsRepository {
  constructor(@Inject('KNEX') private readonly knex: Knex) { }

  async findById(id: string): Promise<WebhookEvent | null> {
    const row = await this.knex<WebhookEventRow>('webhook_events')
      .where({ id })
      .first();

    return row ? WebhookEventMapper.toDomain(row) : null;
  }

  async findByExternalId(externalId: string): Promise<WebhookEvent | null> {
    const row = await this.knex<WebhookEventRow>('webhook_events')
      .where({ external_id: externalId })
      .first();

    return row ? WebhookEventMapper.toDomain(row) : null;
  }

  async create(event: WebhookEvent): Promise<WebhookEvent> {
    const row = WebhookEventMapper.toPersistence(event);

    try {
      const [inserted] = await this.knex<WebhookEventRow>('webhook_events')
        .insert(row)
        .returning('*');

      return WebhookEventMapper.toDomain(inserted);
    } catch (error: any) {
      // Handle unique constraint violation for external_id (PostgreSQL error code 23505)
      if (error.code === '23505' && error.constraint === 'webhook_events_external_id_unique') {
        // Return existing record instead of throwing
        const existing = await this.findByExternalId(event.externalId);
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  async updateStatus(
    id: string,
    status: WebhookEventStatus,
    trx?: Knex.Transaction,
  ): Promise<void> {
    const db = trx || this.knex;

    const updates: any = {
      status,
      updated_at: new Date(),
    };

    // Set processed_at timestamp when status becomes PROCESSED
    if (status === WebhookEventStatus.PROCESSED) {
      updates.processed_at = new Date();
    }

    await db('webhook_events').update(updates).where({ id });
  }

  async findPendingForRetry(limit: number = 10): Promise<WebhookEvent[]> {
    const rows = await this.knex<WebhookEventRow>('webhook_events')
      .where({ status: WebhookEventStatus.FAILED })
      .where('retry_count', '<', 3)
      .orderBy('created_at', 'asc')
      .limit(limit);

    return WebhookEventMapper.toDomainList(rows);
  }

  async incrementRetryCount(
    id: string,
    trx?: Knex.Transaction,
  ): Promise<void> {
    const db = trx || this.knex;

    await db('webhook_events')
      .where({ id })
      .increment('retry_count', 1)
      .update({
        updated_at: new Date(),
      });
  }

  async updatePaymentAssociation(
    id: string,
    paymentId: string,
    trx?: Knex.Transaction,
  ): Promise<void> {
    const db = trx || this.knex;

    await db('webhook_events')
      .update({
        payment_id: paymentId,
        updated_at: new Date(),
      })
      .where({ id });
  }

  async updateError(
    id: string,
    errorMessage: string,
    trx?: Knex.Transaction,
  ): Promise<void> {
    const db = trx || this.knex;

    await db('webhook_events')
      .update({
        error_message: errorMessage,
        updated_at: new Date(),
      })
      .where({ id });
  }
}
