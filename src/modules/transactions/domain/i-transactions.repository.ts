import { Knex } from 'knex';
import { Transaction } from './transaction.entity';
import { CreateTransactionData } from './transaction.types';

export abstract class ITransactionsRepository {
  abstract create(data: CreateTransactionData, trx: Knex.Transaction): Promise<Transaction>;
  abstract findById(id: string): Promise<Transaction | null>;
  abstract findByAccountId(accountId: string): Promise<Transaction[]>;
  abstract findByReferenceId(referenceId: string): Promise<Transaction[]>;
}
