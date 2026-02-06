import { Transaction } from '../domain/transaction.entity';
import { TransactionType } from '../domain/transaction.types';

export interface TransactionRow {
  id: string;
  account_id: string;
  amount: string;
  type: string;
  reference_id: string | null;
  reference_type: string | null;
  description: string | null;
  metadata: any;
  created_at: Date;
}

export class TransactionMapper {
  static toDomain(row: TransactionRow): Transaction {
    return new Transaction({
      id: row.id,
      accountId: row.account_id,
      amount: parseFloat(row.amount),
      type: row.type as TransactionType,
      referenceId: row.reference_id,
      referenceType: row.reference_type,
      description: row.description,
      metadata: row.metadata,
      createdAt: row.created_at,
    });
  }

  static toDomainList(rows: TransactionRow[]): Transaction[] {
    return rows.map((row) => this.toDomain(row));
  }
}
