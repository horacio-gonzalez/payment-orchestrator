import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { Knex } from 'knex';
import { IAccountsRepository } from './i-accounts.repository';
import { Account, Currency, AccountStatus } from './account.entity';

@Injectable()
export class AccountsService {
  constructor(
    private accountsRepository: IAccountsRepository,
    @Inject('KNEX') private knex: Knex,
  ) { }

  // ============================================
  // READ OPERATIONS
  // ============================================

  async findById(accountId: string): Promise<Account> {
    const account = await this.accountsRepository.findById(accountId);
    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }
    return account;
  }

  async findPrimaryByUser(userId: string): Promise<Account> {
    const account = await this.accountsRepository.findPrimaryByUser(userId);
    if (!account) {
      throw new NotFoundException(`No primary account found for user ${userId}`);
    }
    return account;
  }

  // ============================================
  // WRITE OPERATIONS
  // ============================================

  async createAccount(userId: string, currency: Currency): Promise<Account> {
    try {
      return await this.accountsRepository.create(userId, currency);
    } catch (error) {
      throw new Error(error);
    }
  }

  // ============================================
  // BALANCE OPERATIONS (with pessimistic locking)
  // ============================================

  /**
   * Credit funds to account
   * Used for: payment confirmations, refunds
   */
  async creditFunds(accountId: string, amount: number, trx?: Knex.Transaction): Promise<void> {
    this.validateAmount(amount);

    const execute = async (t: Knex.Transaction) => {
      const account = await this.accountsRepository.findByIdForUpdate(accountId, t);
      if (!account) {
        throw new NotFoundException(`Account ${accountId} not found`);
      }

      if (!account.canCredit()) {
        throw new BadRequestException(`Account ${accountId} cannot receive credits (status: ${account.status})`);
      }

      await this.accountsRepository.increaseBalance(accountId, amount, t);
    };

    if (trx) {
      await execute(trx);
    } else {
      await this.knex.transaction(execute);
    }
  }

  /**
   * Debit funds from account
   * Used for: withdrawals, payment processing
   */
  async debitFunds(accountId: string, amount: number, trx?: Knex.Transaction): Promise<void> {
    this.validateAmount(amount);

    const execute = async (t: Knex.Transaction) => {
      const account = await this.accountsRepository.findByIdForUpdate(accountId, t);
      if (!account) {
        throw new NotFoundException(`Account ${accountId} not found`);
      }

      if (!account.canDebit(amount)) {
        throw new BadRequestException(
          `Insufficient funds. Available: ${account.availableBalance}, Required: ${amount}`
        );
      }

      await this.accountsRepository.decreaseBalance(accountId, amount, t);
    };

    if (trx) {
      await execute(trx);
    } else {
      await this.knex.transaction(execute);
    }
  }

  /**
   * Reserve funds for pending operations
   * Used for: pending payments, holds
   */
  async reserveFunds(accountId: string, amount: number, trx?: Knex.Transaction): Promise<void> {
    this.validateAmount(amount);

    const execute = async (t: Knex.Transaction) => {
      const account = await this.accountsRepository.findByIdForUpdate(accountId, t);
      if (!account) {
        throw new NotFoundException(`Account ${accountId} not found`);
      }

      if (!account.canDebit(amount)) {
        throw new BadRequestException(
          `Insufficient funds to reserve. Available: ${account.availableBalance}, Required: ${amount}`
        );
      }

      await this.accountsRepository.reserveBalance(accountId, amount, t);
    };

    if (trx) {
      await execute(trx);
    } else {
      await this.knex.transaction(execute);
    }
  }

  /**
   * Release reserved funds
   * Used for: cancelled payments, expired holds
   */
  async releaseReserve(accountId: string, amount: number, trx?: Knex.Transaction): Promise<void> {
    this.validateAmount(amount);

    const execute = async (t: Knex.Transaction) => {
      const account = await this.accountsRepository.findByIdForUpdate(accountId, t);
      if (!account) {
        throw new NotFoundException(`Account ${accountId} not found`);
      }

      if (account.reservedBalance < amount) {
        throw new BadRequestException(
          `Insufficient reserved balance. Reserved: ${account.reservedBalance}, Requested: ${amount}`
        );
      }

      await this.accountsRepository.releaseReserve(accountId, amount, t);
    };

    if (trx) {
      await execute(trx);
    } else {
      await this.knex.transaction(execute);
    }
  }

  /**
   * Confirm reserved funds (convert reserve to actual debit)
   * Used for: confirming pending payments
   */
  async confirmReservedFunds(accountId: string, amount: number, trx?: Knex.Transaction): Promise<void> {
    this.validateAmount(amount);

    const execute = async (t: Knex.Transaction) => {
      const account = await this.accountsRepository.findByIdForUpdate(accountId, t);
      if (!account) {
        throw new NotFoundException(`Account ${accountId} not found`);
      }

      if (account.reservedBalance < amount) {
        throw new BadRequestException(
          `Insufficient reserved balance. Reserved: ${account.reservedBalance}, Requested: ${amount}`
        );
      }

      // Release reserve and debit actual balance
      await this.accountsRepository.releaseReserve(accountId, amount, t);
      await this.accountsRepository.decreaseBalance(accountId, amount, t);
    };

    if (trx) {
      await execute(trx);
    } else {
      await this.knex.transaction(execute);
    }
  }

  // ============================================
  // VALIDATION
  // ============================================

  private validateAmount(amount: number): void {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    if (!Number.isFinite(amount)) {
      throw new BadRequestException('Amount must be a valid number');
    }

    // Prevent precision issues (2 decimal places max)
    if (Math.round(amount * 100) !== amount * 100) {
      throw new BadRequestException('Amount cannot have more than 2 decimal places');
    }
  }
}
