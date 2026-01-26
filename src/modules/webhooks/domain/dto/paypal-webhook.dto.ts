export class PayPalWebhookDto {
  id: string;
  event_version: string;
  create_time: string;
  resource_type: string;
  event_type: string;
  summary: string;
  resource: {
    id: string;
    state?: string;
    amount?: {
      total: string;
      currency: string;
      details?: Record<string, any>;
    };
    parent_payment?: string;
    update_time?: string;
    create_time?: string;
    [key: string]: any;
  };
  links: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

export class PayPalPaymentSaleCompletedDto {
  id: string;
  event_type: 'PAYMENT.SALE.COMPLETED';
  resource: {
    id: string;
    state: 'completed';
    amount: {
      total: string;
      currency: string;
    };
    parent_payment: string;
  };
}

export class PayPalPaymentSaleRefundedDto {
  id: string;
  event_type: 'PAYMENT.SALE.REFUNDED';
  resource: {
    id: string;
    state: 'refunded';
    amount: {
      total: string;
      currency: string;
    };
    sale_id: string;
  };
}

export class PayPalPaymentCaptureDeniedDto {
  id: string;
  event_type: 'PAYMENT.CAPTURE.DENIED';
  resource: {
    id: string;
    state: 'denied';
    amount: {
      total: string;
      currency: string;
    };
    reason_code?: string;
  };
}
