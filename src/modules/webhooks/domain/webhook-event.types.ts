export enum WebhookEventStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  FAILED = 'failed',
  DUPLICATE = 'duplicate',
}

export enum WebhookProvider {
  STRIPE = 'stripe',
  PAYPAL = 'paypal',
  MOCK = 'mock',
}

export interface CreateWebhookEventData {
  externalId: string;
  provider: WebhookProvider;
  eventType: string;
  payload: Record<string, any>;
  paymentId?: string | null;
}
