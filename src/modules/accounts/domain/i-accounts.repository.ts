import { Account } from './account.entity';

// src/modules/accounts/domain/accounts.repository.interface.ts
export interface IAccountsRepository {
  findById(accountId: string): Promise<Account | null>;
  findPrimaryByUser(userId: string): Promise<Account | null>;
  // Agregar otros métodos que necesites
}
