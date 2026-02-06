import { Account, AccountStatus, Currency } from './account.entity';

describe('Account Entity', () => {
  function createAccount(overrides: Partial<Account> = {}): Account {
    const account = new Account();
    Object.assign(account, {
      id: 'acc_123',
      userId: 'user_456',
      balance: 1000,
      reservedBalance: 200,
      currency: Currency.USD,
      status: AccountStatus.ACTIVE,
      isPrimary: true,
      metadata: {},
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    });
    return account;
  }

  describe('availableBalance', () => {
    it('should return balance minus reservedBalance', () => {
      const account = createAccount({ balance: 1000, reservedBalance: 200 });
      expect(account.availableBalance).toBe(800);
    });

    it('should return full balance when no reserved amount', () => {
      const account = createAccount({ balance: 500, reservedBalance: 0 });
      expect(account.availableBalance).toBe(500);
    });

    it('should return 0 when fully reserved', () => {
      const account = createAccount({ balance: 300, reservedBalance: 300 });
      expect(account.availableBalance).toBe(0);
    });
  });

  describe('canDebit', () => {
    it('should return true when active and sufficient available balance', () => {
      const account = createAccount({
        status: AccountStatus.ACTIVE,
        balance: 1000,
        reservedBalance: 200,
      });
      expect(account.canDebit(800)).toBe(true);
    });

    it('should return true when debiting exact available balance', () => {
      const account = createAccount({
        status: AccountStatus.ACTIVE,
        balance: 1000,
        reservedBalance: 200,
      });
      expect(account.canDebit(800)).toBe(true);
    });

    it('should return false when insufficient available balance', () => {
      const account = createAccount({
        status: AccountStatus.ACTIVE,
        balance: 1000,
        reservedBalance: 200,
      });
      expect(account.canDebit(801)).toBe(false);
    });

    it('should return false when account is frozen', () => {
      const account = createAccount({
        status: AccountStatus.FROZEN,
        balance: 1000,
        reservedBalance: 0,
      });
      expect(account.canDebit(100)).toBe(false);
    });

    it('should return false when account is suspended', () => {
      const account = createAccount({
        status: AccountStatus.SUSPENDED,
        balance: 1000,
        reservedBalance: 0,
      });
      expect(account.canDebit(100)).toBe(false);
    });

    it('should return false when account is closed', () => {
      const account = createAccount({
        status: AccountStatus.CLOSED,
        balance: 1000,
        reservedBalance: 0,
      });
      expect(account.canDebit(100)).toBe(false);
    });
  });

  describe('canCredit', () => {
    it('should return true when account is active', () => {
      const account = createAccount({ status: AccountStatus.ACTIVE });
      expect(account.canCredit()).toBe(true);
    });

    it('should return true when account is frozen', () => {
      const account = createAccount({ status: AccountStatus.FROZEN });
      expect(account.canCredit()).toBe(true);
    });

    it('should return true when account is suspended', () => {
      const account = createAccount({ status: AccountStatus.SUSPENDED });
      expect(account.canCredit()).toBe(true);
    });

    it('should return false when account is closed', () => {
      const account = createAccount({ status: AccountStatus.CLOSED });
      expect(account.canCredit()).toBe(false);
    });
  });

  describe('isOperational', () => {
    it('should return true when account is active', () => {
      const account = createAccount({ status: AccountStatus.ACTIVE });
      expect(account.isOperational()).toBe(true);
    });

    it.each([
      AccountStatus.FROZEN,
      AccountStatus.SUSPENDED,
      AccountStatus.CLOSED,
    ])('should return false when account is %s', (status) => {
      const account = createAccount({ status });
      expect(account.isOperational()).toBe(false);
    });
  });
});
