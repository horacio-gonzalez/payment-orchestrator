import { PaymentStatus } from './payment.types';

export class Payment {
  id: string;
  accountId: string;
  amount: number;
  status: PaymentStatus;
  provider: string;
  createdAt: Date;
  updatedAt: Date;

  constructor(data: Partial<Payment>) {
    Object.assign(this, data);
  }

  // Domain logic (optional)
  isCompleted(): boolean {
    return this.status === PaymentStatus.COMPLETED;
  }

  canBeRefunded(): boolean {
    return this.isCompleted() && this.amount > 0;
  }
}
