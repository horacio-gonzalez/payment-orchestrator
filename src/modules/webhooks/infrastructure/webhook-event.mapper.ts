import { WebhookEvent } from '../domain/webhook-event.entity';
import {
  WebhookEventStatus,
  WebhookProvider,
} from '../domain/webhook-event.types';

export interface WebhookEventRow {
  id: string;
  external_id: string;
  provider: string;
  event_type: string;
  payload: any;
  status: string;
  payment_id: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: Date;
  updated_at: Date;
  processed_at: Date | null;
}

export class WebhookEventMapper {
  static toDomain(row: WebhookEventRow): WebhookEvent {
    return new WebhookEvent({
      id: row.id,
      externalId: row.external_id,
      provider: row.provider as WebhookProvider,
      eventType: row.event_type,
      payload: row.payload,
      status: row.status as WebhookEventStatus,
      paymentId: row.payment_id,
      errorMessage: row.error_message,
      retryCount: row.retry_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      processedAt: row.processed_at,
    });
  }

  static toPersistence(event: Partial<WebhookEvent>): Partial<WebhookEventRow> {
    const row: Partial<WebhookEventRow> = {};

    if (event.id !== undefined) row.id = event.id;
    if (event.externalId !== undefined) row.external_id = event.externalId;
    if (event.provider !== undefined) row.provider = event.provider;
    if (event.eventType !== undefined) row.event_type = event.eventType;
    if (event.payload !== undefined) row.payload = event.payload;
    if (event.status !== undefined) row.status = event.status;
    if (event.paymentId !== undefined) row.payment_id = event.paymentId;
    if (event.errorMessage !== undefined)
      row.error_message = event.errorMessage;
    if (event.retryCount !== undefined) row.retry_count = event.retryCount;
    if (event.createdAt !== undefined) row.created_at = event.createdAt;
    if (event.updatedAt !== undefined) row.updated_at = event.updatedAt;
    if (event.processedAt !== undefined) row.processed_at = event.processedAt;

    return row;
  }

  static toDomainList(rows: WebhookEventRow[]): WebhookEvent[] {
    return rows.map((row) => this.toDomain(row));
  }
}
