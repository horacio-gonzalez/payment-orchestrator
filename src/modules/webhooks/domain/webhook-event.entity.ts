import { WebhookEventStatus, WebhookProvider } from './webhook-event.types';

export class WebhookEvent {
  id: string;
  externalId: string;
  provider: WebhookProvider;
  eventType: string;
  payload: Record<string, any>;
  status: WebhookEventStatus;
  paymentId: string | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
  processedAt: Date | null;

  constructor(data: Partial<WebhookEvent>) {
    Object.assign(this, data);
  }

  isProcessed(): boolean {
    return this.status === WebhookEventStatus.PROCESSED;
  }

  isDuplicate(): boolean {
    return this.status === WebhookEventStatus.DUPLICATE;
  }

  canRetry(): boolean {
    return this.status === WebhookEventStatus.FAILED && this.retryCount < 3;
  }

  isFailed(): boolean {
    return this.status === WebhookEventStatus.FAILED;
  }

  isPending(): boolean {
    return this.status === WebhookEventStatus.PENDING;
  }

  isProcessing(): boolean {
    return this.status === WebhookEventStatus.PROCESSING;
  }
}
