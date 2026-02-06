import { Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { ITransactionsRepository } from '../domain/i-transactions.repository';
import { Transaction } from '../domain/transaction.entity';
import { CreateTransactionData } from '../domain/transaction.types';
import { TransactionMapper, TransactionRow } from './transaction.mapper';

@Injectable()
export class TransactionsRepository implements ITransactionsRepository {
  constructor(@Inject('KNEX') private readonly knex: Knex) { }

  async create(data: CreateTransactionData, trx: Knex.Transaction): Promise<Transaction> {
    const row = {
      id: randomUUID(),
      account_id: data.accountId,
      amount: data.amount.toString(),
      type: data.type,
      reference_id: data.referenceId ?? null,
      reference_type: data.referenceType ?? null,
      description: data.description ?? null,
      metadata: data.metadata ?? {},
    };

    const [inserted] = await trx<TransactionRow>('transactions')
      .insert(row)
      .returning('*');

    return TransactionMapper.toDomain(inserted);
  }

  async findById(id: string): Promise<Transaction | null> {
    const row = await this.knex<TransactionRow>('transactions')
      .where({ id })
      .first();

    return row ? TransactionMapper.toDomain(row) : null;
  }

  async findByAccountId(accountId: string): Promise<Transaction[]> {
    const rows = await this.knex<TransactionRow>('transactions')
      .where({ account_id: accountId })
      .orderBy('created_at', 'desc');

    return TransactionMapper.toDomainList(rows);
  }

  async findByReferenceId(referenceId: string): Promise<Transaction[]> {
    const rows = await this.knex<TransactionRow>('transactions')
      .where({ reference_id: referenceId })
      .orderBy('created_at', 'desc');

    return TransactionMapper.toDomainList(rows);
  }
}
