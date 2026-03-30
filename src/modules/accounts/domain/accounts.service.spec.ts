import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { IAccountsRepository } from './i-accounts.repository';
import { Account, AccountStatus, Currency } from './account.entity';

describe('AccountsService', () => {
  let service: AccountsService;
  let mockRepo: jest.Mocked<IAccountsRepository>;
  let mockKnex: any;

  function createAccount(overrides: Partial<Account> = {}): Account {
    const account = new Account();
    account.id = 'acc-1';
    account.userId = 'user-1';
    account.balance = 1000;
    account.reservedBalance = 0;
    account.currency = Currency.USD;
    account.status = AccountStatus.ACTIVE;
    account.isPrimary = true;
    account.metadata = {};
    account.createdAt = new Date();
    account.updatedAt = new Date();
    Object.assign(account, overrides);
    return account;
  }

  beforeEach(async () => {
    mockRepo = {
      findById: jest.fn(),
      findByIdForUpdate: jest.fn(),
      findPrimaryByUser: jest.fn(),
      create: jest.fn(),
      increaseBalance: jest.fn(),
      decreaseBalance: jest.fn(),
      reserveBalance: jest.fn(),
      releaseReserve: jest.fn(),
    } as any;

    mockKnex = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        sum: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({ total: '500' }),
        }),
      }),
    });
    mockKnex.transaction = jest.fn(async (fn) => fn(mockKnex));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: IAccountsRepository, useValue: mockRepo },
        { provide: 'KNEX', useValue: mockKnex },
      ],
    }).compile();

    service = module.get<AccountsService>(AccountsService);
  });

  describe('findById', () => {
    it('should return account when found', async () => {
      const account = createAccount();
      mockRepo.findById.mockResolvedValue(account);

      const result = await service.findById('acc-1');
      expect(result).toBe(account);
    });

    it('should throw NotFoundException when not found', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findPrimaryByUser', () => {
    it('should return primary account', async () => {
      const account = createAccount();
      mockRepo.findPrimaryByUser.mockResolvedValue(account);

      const result = await service.findPrimaryByUser('user-1');
      expect(result).toBe(account);
    });

    it('should throw NotFoundException when no primary account', async () => {
      mockRepo.findPrimaryByUser.mockResolvedValue(null);
      await expect(service.findPrimaryByUser('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createAccount', () => {
    it('should create account via repository', async () => {
      const account = createAccount({ balance: 0 });
      mockRepo.create.mockResolvedValue(account);

      const result = await service.createAccount('user-1', Currency.USD);
      expect(result).toBe(account);
      expect(mockRepo.create).toHaveBeenCalledWith('user-1', Currency.USD);
    });

    it('should throw on repository error', async () => {
      mockRepo.create.mockRejectedValue(new Error('duplicate'));
      await expect(service.createAccount('user-1', Currency.USD)).rejects.toThrow();
    });
  });

  describe('creditFunds', () => {
    it('should credit funds to active account', async () => {
      const account = createAccount();
      mockRepo.findByIdForUpdate.mockResolvedValue(account);

      await service.creditFunds('acc-1', 100);

      expect(mockRepo.findByIdForUpdate).toHaveBeenCalledWith('acc-1', expect.anything());
      expect(mockRepo.increaseBalance).toHaveBeenCalledWith('acc-1', 100, expect.anything());
    });

    it('should reject credit to closed account', async () => {
      const account = createAccount({ status: AccountStatus.CLOSED });
      mockRepo.findByIdForUpdate.mockResolvedValue(account);

      await expect(service.creditFunds('acc-1', 100)).rejects.toThrow(BadRequestException);
    });

    it('should use external transaction when provided', async () => {
      const account = createAccount();
      mockRepo.findByIdForUpdate.mockResolvedValue(account);
      const trx = {} as any;

      await service.creditFunds('acc-1', 100, trx);

      expect(mockRepo.findByIdForUpdate).toHaveBeenCalledWith('acc-1', trx);
      expect(mockKnex.transaction).not.toHaveBeenCalled();
    });
  });

  describe('debitFunds', () => {
    it('should debit funds from account with sufficient balance', async () => {
      const account = createAccount({ balance: 500 });
      mockRepo.findByIdForUpdate.mockResolvedValue(account);

      await service.debitFunds('acc-1', 200);

      expect(mockRepo.decreaseBalance).toHaveBeenCalledWith('acc-1', 200, expect.anything());
    });

    it('should reject debit with insufficient funds', async () => {
      const account = createAccount({ balance: 100 });
      mockRepo.findByIdForUpdate.mockResolvedValue(account);

      await expect(service.debitFunds('acc-1', 200)).rejects.toThrow('Insufficient funds');
    });

    it('should reject debit on non-active account', async () => {
      const account = createAccount({ status: AccountStatus.FROZEN });
      mockRepo.findByIdForUpdate.mockResolvedValue(account);

      await expect(service.debitFunds('acc-1', 50)).rejects.toThrow('Insufficient funds');
    });
  });

  describe('reserveFunds', () => {
    it('should reserve funds', async () => {
      const account = createAccount({ balance: 500 });
      mockRepo.findByIdForUpdate.mockResolvedValue(account);

      await service.reserveFunds('acc-1', 200);

      expect(mockRepo.reserveBalance).toHaveBeenCalledWith('acc-1', 200, expect.anything());
    });

    it('should reject when insufficient available balance', async () => {
      const account = createAccount({ balance: 100 });
      mockRepo.findByIdForUpdate.mockResolvedValue(account);

      await expect(service.reserveFunds('acc-1', 200)).rejects.toThrow('Insufficient funds');
    });
  });

  describe('releaseReserve', () => {
    it('should release reserved funds', async () => {
      const account = createAccount({ reservedBalance: 200 });
      mockRepo.findByIdForUpdate.mockResolvedValue(account);

      await service.releaseReserve('acc-1', 100);

      expect(mockRepo.releaseReserve).toHaveBeenCalledWith('acc-1', 100, expect.anything());
    });

    it('should reject when releasing more than reserved', async () => {
      const account = createAccount({ reservedBalance: 50 });
      mockRepo.findByIdForUpdate.mockResolvedValue(account);

      await expect(service.releaseReserve('acc-1', 100)).rejects.toThrow(
        'Insufficient reserved balance',
      );
    });
  });

  describe('confirmReservedFunds', () => {
    it('should release reserve and decrease balance', async () => {
      const account = createAccount({ reservedBalance: 200 });
      mockRepo.findByIdForUpdate.mockResolvedValue(account);

      await service.confirmReservedFunds('acc-1', 100);

      expect(mockRepo.releaseReserve).toHaveBeenCalledWith('acc-1', 100, expect.anything());
      expect(mockRepo.decreaseBalance).toHaveBeenCalledWith('acc-1', 100, expect.anything());
    });

    it('should reject when insufficient reserved balance', async () => {
      const account = createAccount({ reservedBalance: 50 });
      mockRepo.findByIdForUpdate.mockResolvedValue(account);

      await expect(service.confirmReservedFunds('acc-1', 100)).rejects.toThrow(
        'Insufficient reserved balance',
      );
    });
  });

  describe('reconcileBalance', () => {
    it('should return discrepancy between cached and calculated balance', async () => {
      const account = createAccount({ balance: 1000 });
      mockRepo.findById.mockResolvedValue(account);

      const result = await service.reconcileBalance('acc-1');

      expect(result.cached).toBe(1000);
      expect(result.calculated).toBe(500);
      expect(result.discrepancy).toBe(500);
    });

    it('should throw NotFoundException for non-existent account', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.reconcileBalance('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('amount validation', () => {
    it('should reject zero amount', async () => {
      await expect(service.creditFunds('acc-1', 0)).rejects.toThrow(
        'Amount must be greater than zero',
      );
    });

    it('should reject negative amount', async () => {
      await expect(service.creditFunds('acc-1', -10)).rejects.toThrow(
        'Amount must be greater than zero',
      );
    });

    it('should reject Infinity', async () => {
      await expect(service.creditFunds('acc-1', Infinity)).rejects.toThrow(
        'Amount must be a valid number',
      );
    });

    it('should reject NaN', async () => {
      await expect(service.creditFunds('acc-1', NaN)).rejects.toThrow(
        'Amount must be a valid number',
      );
    });

    it('should reject more than 2 decimal places', async () => {
      await expect(service.creditFunds('acc-1', 10.123)).rejects.toThrow(
        'Amount cannot have more than 2 decimal places',
      );
    });
  });
});
