export enum Currency {
  USD = 'USD',
  EUR = 'EUR',
  ARS = 'ARS',
  GBP = 'GBP',
}

export enum AccountStatus {
  ACTIVE = 'active',
  FROZEN = 'frozen',
  SUSPENDED = 'suspended',
  CLOSED = 'closed',
}

export class Account {
  id: string;
  userId: string;
  balance: number;
  reservedBalance: number;
  currency: Currency;
  status: AccountStatus;
  isPrimary: boolean;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;

  // ============================================
  // COMPUTED PROPERTIES
  // ============================================

  /**
   * Available balance for new transactions
   * Formula: balance - reserved_balance
   */
  get availableBalance(): number {
    return this.balance - this.reservedBalance;
  }

  // ============================================
  // DOMAIN METHODS
  // ============================================

  /**
   * Check if account can debit amount
   */
  canDebit(amount: number): boolean {
    return (
      this.status === AccountStatus.ACTIVE && this.availableBalance >= amount
    );
  }

  /**
   * Check if account can receive credits
   */
  canCredit(): boolean {
    return this.status !== AccountStatus.CLOSED;
  }

  /**
   * Check if account is operational
   */
  isOperational(): boolean {
    return this.status === AccountStatus.ACTIVE;
  }
}
