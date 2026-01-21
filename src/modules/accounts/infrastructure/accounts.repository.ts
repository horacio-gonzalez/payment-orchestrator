import { Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { Account, AccountStatus, Currency } from '../domain/account.entity';
import { IAccountsRepository } from '../domain/i-accounts.repository';

@Injectable()
export class AccountsRepository implements IAccountsRepository {
  constructor(@Inject('KNEX') private knex: Knex) {}

  async findById(accountId: string): Promise<Account | null> {
    const row = await this.knex('accounts').where({ id: accountId }).first();

    return row ? this.mapToEntity(row) : null;
  }

  async findPrimaryByUser(userId: string): Promise<Account | null> {
    const row = await this.knex('accounts')
      .where({ user_id: userId, is_primary: true })
      .first();

    return row ? this.mapToEntity(row) : null;
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
