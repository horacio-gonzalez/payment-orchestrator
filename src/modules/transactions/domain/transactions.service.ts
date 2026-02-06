import { Injectable, NotFoundException } from '@nestjs/common';
import { Knex } from 'knex';
import { ITransactionsRepository } from './i-transactions.repository';
import { Transaction } from './transaction.entity';
import { TransactionType } from './transaction.types';

@Injectable()
export class TransactionsService {
  constructor(private readonly transactionsRepository: ITransactionsRepository) { }

  async recordCredit(
    accountId: string,
    amount: number,
    referenceId: string,
    referenceType: string,
    trx: Knex.Transaction,
    description?: string,
  ): Promise<Transaction> {
    return this.transactionsRepository.create(
      {
        accountId,
        amount,
        type: TransactionType.CREDIT,
        referenceId,
        referenceType,
        description,
      },
      trx,
    );
  }

  async recordDebit(
    accountId: string,
    amount: number,
    referenceId: string,
    referenceType: string,
    trx: Knex.Transaction,
    description?: string,
  ): Promise<Transaction> {
    return this.transactionsRepository.create(
      {
        accountId,
        amount: -amount,
        type: TransactionType.DEBIT,
        referenceId,
        referenceType,
        description,
      },
      trx,
    );
  }

  async recordReserve(
    accountId: string,
    amount: number,
    referenceId: string,
    referenceType: string,
    trx: Knex.Transaction,
  ): Promise<Transaction> {
    return this.transactionsRepository.create(
      {
        accountId,
        amount: -amount,
        type: TransactionType.RESERVE,
        referenceId,
        referenceType,
      },
      trx,
    );
  }

  async recordRelease(
    accountId: string,
    amount: number,
    referenceId: string,
    referenceType: string,
    trx: Knex.Transaction,
  ): Promise<Transaction> {
    return this.transactionsRepository.create(
      {
        accountId,
        amount,
        type: TransactionType.RELEASE,
        referenceId,
        referenceType,
      },
      trx,
    );
  }

  async findById(id: string): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findById(id);
    if (!transaction) {
      throw new NotFoundException(`Transaction ${id} not found`);
    }
    return transaction;
  }

  async findByAccountId(accountId: string): Promise<Transaction[]> {
    return this.transactionsRepository.findByAccountId(accountId);
  }

  async findByReferenceId(referenceId: string): Promise<Transaction[]> {
    return this.transactionsRepository.findByReferenceId(referenceId);
  }
}
