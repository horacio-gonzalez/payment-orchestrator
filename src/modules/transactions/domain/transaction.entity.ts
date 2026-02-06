import { TransactionType } from './transaction.types';

export class Transaction {
  id: string;
  accountId: string;
  amount: number;
  type: TransactionType;
  referenceId: string | null;
  referenceType: string | null;
  description: string | null;
  metadata: Record<string, any>;
  createdAt: Date;

  constructor(data: Partial<Transaction>) {
    Object.assign(this, data);
  }

  isCredit(): boolean {
    return this.type === TransactionType.CREDIT;
  }

  isDebit(): boolean {
    return this.type === TransactionType.DEBIT;
  }
}
