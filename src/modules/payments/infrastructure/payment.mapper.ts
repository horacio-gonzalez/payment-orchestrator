import { Payment } from '../domain/payment.entity';
import { PaymentStatus } from '../domain/payment.types';

export interface PaymentRow {
  id: string;
  account_id: string;
  amount: string;
  status: string;
  provider: string;
  metadata: any;
  created_at: Date;
  updated_at: Date;
}

export class PaymentMapper {
  // DB row → Domain entity
  static toDomain(row: PaymentRow): Payment {
    return new Payment({
      id: row.id,
      accountId: row.account_id,
      amount: parseFloat(row.amount), // Convertir string a number
      status: row.status as PaymentStatus,
      provider: row.provider,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  // Domain entity → DB row
  static toPersistence(payment: Payment): Partial<PaymentRow> {
    return {
      id: payment.id,
      account_id: payment.accountId,
      amount: payment.amount.toString(), // Number a string para DECIMAL
      status: payment.status,
      provider: payment.provider,
      created_at: payment.createdAt,
      updated_at: payment.updatedAt,
    };
  }

  // Array mapper
  static toDomainList(rows: PaymentRow[]): Payment[] {
    return rows.map((row) => this.toDomain(row));
  }
}
