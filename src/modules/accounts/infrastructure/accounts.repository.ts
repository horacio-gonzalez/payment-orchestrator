import { Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { Account, AccountStatus, Currency } from '../domain/account.entity';
import { IAccountsRepository } from '../domain/i-accounts.repository';
import { randomUUID } from 'crypto';

@Injectable()
export class AccountsRepository implements IAccountsRepository {
  constructor(@Inject('KNEX') private knex: Knex) { }

  // ============================================
  // READ OPERATIONS
  // ============================================

  async findById(accountId: string, trx?: Knex.Transaction): Promise<Account | null> {
    const query = (trx || this.knex)('accounts').where({ id: accountId }).first();
    const row = await query;

    return row ? this.mapToEntity(row) : null;
  }

  /**
   * Find account with pessimistic locking (FOR UPDATE)
   * CRITICAL: Prevents race conditions on balance operations
   */
  async findByIdForUpdate(accountId: string, trx: Knex.Transaction): Promise<Account | null> {
    const row = await trx('accounts')
      .where({ id: accountId })
      .forUpdate()  // SELECT ... FOR UPDATE
      .first();

    return row ? this.mapToEntity(row) : null;
  }

  async findPrimaryByUser(userId: string): Promise<Account | null> {
    const row = await this.knex('accounts')
      .where({ user_id: userId, is_primary: true })
      .first();

    return row ? this.mapToEntity(row) : null;
  }

  // ============================================
  // WRITE OPERATIONS
  // ============================================

  async create(userId: string, currency: Currency, trx?: Knex.Transaction): Promise<Account> {
    const id = randomUUID();
    const now = new Date();

    const accountData = {
      id,
      user_id: userId,
      balance: 0,
      reserved_balance: 0,
      currency,
      status: AccountStatus.ACTIVE,
      is_primary: true,
      metadata: {},
      created_at: now,
      updated_at: now,
    };

    await (trx || this.knex)('accounts').insert(accountData);

    return this.mapToEntity(accountData);
  }

  // ============================================
  // BALANCE MUTATIONS (require transaction)
  // ============================================

  async increaseBalance(accountId: string, amount: number, trx: Knex.Transaction): Promise<void> {
    await trx('accounts')
      .where({ id: accountId })
      .increment('balance', amount)
      .update({ updated_at: new Date() });
  }

  async decreaseBalance(accountId: string, amount: number, trx: Knex.Transaction): Promise<void> {
    await trx('accounts')
      .where({ id: accountId })
      .decrement('balance', amount)
      .update({ updated_at: new Date() });
  }

  async reserveBalance(accountId: string, amount: number, trx: Knex.Transaction): Promise<void> {
    await trx('accounts')
      .where({ id: accountId })
      .increment('reserved_balance', amount)
      .update({ updated_at: new Date() });
  }

  async releaseReserve(accountId: string, amount: number, trx: Knex.Transaction): Promise<void> {
    await trx('accounts')
      .where({ id: accountId })
      .decrement('reserved_balance', amount)
      .update({ updated_at: new Date() });
  }

  private mapToEntity(row: any): Account {
    const account = new Account();
    account.id = row.id;
    account.userId = row.user_id;
    account.balance = parseFloat(row.balance);
    account.reservedBalance = parseFloat(row.reserved_balance);
    // availableBalance se calcula automático via getter
    account.currency = row.currency as Currency;
    account.status = row.status as AccountStatus;
    account.isPrimary = row.is_primary;
    account.metadata = row.metadata;
    account.createdAt = row.created_at;
    account.updatedAt = row.updated_at;

    return account;
  }

  private mapToRow(entity: Partial<Account>): any {
    const row: any = {};

    if (entity.userId !== undefined) row.user_id = entity.userId;
    if (entity.balance !== undefined) row.balance = entity.balance;
    if (entity.reservedBalance !== undefined)
      row.reserved_balance = entity.reservedBalance;
    if (entity.currency !== undefined) row.currency = entity.currency;
    if (entity.status !== undefined) row.status = entity.status;
    if (entity.isPrimary !== undefined) row.is_primary = entity.isPrimary;
    if (entity.metadata !== undefined) row.metadata = entity.metadata;

    // availableBalance NO se mapea - es computed

    return row;
  }
}
