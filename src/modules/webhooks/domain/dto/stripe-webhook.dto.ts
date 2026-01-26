export class StripeWebhookDto {
  id: string;
  object: string;
  api_version: string;
  created: number;
  data: {
    object: {
      id: string;
      object: string;
      amount?: number;
      amount_capturable?: number;
      amount_received?: number;
      currency?: string;
      status?: string;
      payment_method?: string;
      customer?: string;
      metadata?: Record<string, any>;
      [key: string]: any;
    };
    previous_attributes?: Record<string, any>;
  };
  livemode: boolean;
  pending_webhooks: number;
  request: {
    id: string | null;
    idempotency_key: string | null;
  };
  type: string;
}

export class StripePaymentIntentSucceededDto {
  id: string;
  type: 'payment_intent.succeeded';
  data: {
    object: {
      id: string;
      amount: number;
      currency: string;
      status: 'succeeded';
      metadata: Record<string, any>;
    };
  };
}

export class StripePaymentIntentFailedDto {
  id: string;
  type: 'payment_intent.payment_failed';
  data: {
    object: {
      id: string;
      amount: number;
      currency: string;
      status: 'failed';
      last_payment_error?: {
        code?: string;
        message?: string;
        type?: string;
      };
      metadata: Record<string, any>;
    };
  };
}

export class StripeChargeRefundedDto {
  id: string;
  type: 'charge.refunded';
  data: {
    object: {
      id: string;
      amount: number;
      amount_refunded: number;
      currency: string;
      refunded: boolean;
      metadata: Record<string, any>;
    };
  };
}
