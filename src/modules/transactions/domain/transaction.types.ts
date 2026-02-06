export enum TransactionType {
  CREDIT = 'credit',
  DEBIT = 'debit',
  RESERVE = 'reserve',
  RELEASE = 'release',
}

export interface CreateTransactionData {
  accountId: string;
  amount: number;
  type: TransactionType;
  referenceId?: string;
  referenceType?: string;
  description?: string;
  metadata?: Record<string, any>;
}
