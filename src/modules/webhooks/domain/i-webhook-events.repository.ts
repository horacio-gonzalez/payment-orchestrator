import { Knex } from 'knex';
import { WebhookEvent } from './webhook-event.entity';
import { WebhookEventStatus } from './webhook-event.types';

export abstract class IWebhookEventsRepository {
  abstract findById(id: string): Promise<WebhookEvent | null>;

  abstract findByExternalId(externalId: string): Promise<WebhookEvent | null>;

  abstract create(event: WebhookEvent): Promise<WebhookEvent>;

  abstract updateStatus(
    id: string,
    status: WebhookEventStatus,
    trx?: Knex.Transaction,
  ): Promise<void>;

  abstract findPendingForRetry(limit?: number): Promise<WebhookEvent[]>;

  abstract incrementRetryCount(
    id: string,
    trx?: Knex.Transaction,
  ): Promise<void>;

  abstract updatePaymentAssociation(
    id: string,
    paymentId: string,
    trx?: Knex.Transaction,
  ): Promise<void>;

  abstract updateError(
    id: string,
    errorMessage: string,
    trx?: Knex.Transaction,
  ): Promise<void>;
}
