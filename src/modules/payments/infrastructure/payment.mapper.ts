import { Payment } from '../domain/payment.entity';
import { PaymentStatus } from '../domain/payment.types';

export interface PaymentRow {
  id: string;
  account_id: string;
  amount: string;
  currency: string;
  status: string;
  provider: string;
  external_payment_id: string;
  payment_method: string | null;
  description: string | null;
  metadata: any;
  created_at: Date;
  updated_at: Date;
  processed_at: Date | null;
}

export class PaymentMapper {
  static toDomain(row: PaymentRow): Payment {
    return new Payment({
      id: row.id,
      accountId: row.account_id,
      amount: parseFloat(row.amount),
      currency: row.currency,
      status: row.status as PaymentStatus,
      provider: row.provider,
      externalPaymentId: row.external_payment_id,
      paymentMethod: row.payment_method,
      description: row.description,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      processedAt: row.processed_at,
    });
  }

  static toPersistence(payment: Payment): Partial<PaymentRow> {
    return {
      id: payment.id,
      account_id: payment.accountId,
      amount: payment.amount.toString(),
      currency: payment.currency,
      status: payment.status,
      provider: payment.provider,
      external_payment_id: payment.externalPaymentId,
      payment_method: payment.paymentMethod,
      description: payment.description,
      metadata: payment.metadata,
      created_at: payment.createdAt,
      updated_at: payment.updatedAt,
      processed_at: payment.processedAt,
    };
  }

  static toDomainList(rows: PaymentRow[]): Payment[] {
    return rows.map((row) => this.toDomain(row));
  }
}
