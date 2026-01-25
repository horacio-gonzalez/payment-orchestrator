import { Account } from './account.entity';

// src/modules/accounts/domain/accounts.repository.interface.ts
export abstract class IAccountsRepository {
  abstract findById(accountId: string): Promise<Account | null>;
  abstract findPrimaryByUser(userId: string): Promise<Account | null>;
  // Agregar otros métodos que necesites
}
