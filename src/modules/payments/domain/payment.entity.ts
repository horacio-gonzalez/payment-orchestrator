import { PaymentStatus, VALID_PAYMENT_TRANSITIONS } from './payment.types';

export class Payment {
  id: string;
  accountId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  externalPaymentId: string;
  paymentMethod: string | null;
  description: string | null;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  processedAt: Date | null;

  constructor(data: Partial<Payment>) {
    Object.assign(this, data);
  }

  isSucceeded(): boolean {
    return this.status === PaymentStatus.SUCCEEDED;
  }

  canBeRefunded(): boolean {
    return this.isSucceeded() && this.amount > 0;
  }

  canTransitionTo(newStatus: PaymentStatus): boolean {
    const allowed = VALID_PAYMENT_TRANSITIONS[this.status];
    return allowed.includes(newStatus);
  }
}
