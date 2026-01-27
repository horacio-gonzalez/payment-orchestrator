import { Account, Currency } from './account.entity';
import { Knex } from 'knex';

export abstract class IAccountsRepository {
  // Read operations
  abstract findById(accountId: string, trx?: Knex.Transaction): Promise<Account | null>;
  abstract findByIdForUpdate(accountId: string, trx: Knex.Transaction): Promise<Account | null>;
  abstract findPrimaryByUser(userId: string): Promise<Account | null>;

  // Write operations
  abstract create(userId: string, currency: Currency, trx?: Knex.Transaction): Promise<Account>;
  abstract increaseBalance(accountId: string, amount: number, trx: Knex.Transaction): Promise<void>;
  abstract decreaseBalance(accountId: string, amount: number, trx: Knex.Transaction): Promise<void>;
  abstract reserveBalance(accountId: string, amount: number, trx: Knex.Transaction): Promise<void>;
  abstract releaseReserve(accountId: string, amount: number, trx: Knex.Transaction): Promise<void>;
}
