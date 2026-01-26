export class MockWebhookDto {
  id: string;
  provider: 'mock';
  event_type: string;
  timestamp: string;
  data: {
    payment_id: string;
    amount: number;
    currency: string;
    status: 'succeeded' | 'failed' | 'refunded';
    error_message?: string;
    metadata?: Record<string, any>;
  };
}

export class MockPaymentSucceededDto {
  id: string;
  event_type: 'mock.payment.succeeded';
  data: {
    payment_id: string;
    amount: number;
    currency: string;
    status: 'succeeded';
    metadata?: Record<string, any>;
  };
}

export class MockPaymentFailedDto {
  id: string;
  event_type: 'mock.payment.failed';
  data: {
    payment_id: string;
    amount: number;
    currency: string;
    status: 'failed';
    error_message: string;
    metadata?: Record<string, any>;
  };
}

export class MockPaymentRefundedDto {
  id: string;
  event_type: 'mock.payment.refunded';
  data: {
    payment_id: string;
    amount: number;
    currency: string;
    status: 'refunded';
    metadata?: Record<string, any>;
  };
}
