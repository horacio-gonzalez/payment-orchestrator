import { Test, TestingModule } from '@nestjs/testing';
import { AccountsController } from './accounts.controller';
import { AccountsService } from '../domain/accounts.service';
import { Account, Currency, AccountStatus } from '../domain/account.entity';

describe('AccountsController', () => {
  let controller: AccountsController;
  let mockService: jest.Mocked<AccountsService>;

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
    mockService = {
      createAccount: jest.fn(),
      findById: jest.fn(),
      findPrimaryByUser: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountsController],
      providers: [{ provide: AccountsService, useValue: mockService }],
    }).compile();

    controller = module.get<AccountsController>(AccountsController);
  });

  describe('create', () => {
    it('should create account and return formatted response', async () => {
      const account = createAccount();
      mockService.createAccount.mockResolvedValue(account);

      const result = await controller.create({ userId: 'user-1', currency: Currency.USD });

      expect(result.id).toBe('acc-1');
      expect(result.balance).toBe(1000);
      expect(result.availableBalance).toBe(1000);
      expect(mockService.createAccount).toHaveBeenCalledWith('user-1', Currency.USD);
    });
  });

  describe('findOne', () => {
    it('should return account by ID', async () => {
      const account = createAccount();
      mockService.findById.mockResolvedValue(account);

      const result = await controller.findOne('acc-1');

      expect(result.id).toBe('acc-1');
      expect(mockService.findById).toHaveBeenCalledWith('acc-1');
    });
  });

  describe('findPrimaryByUser', () => {
    it('should return primary account for user', async () => {
      const account = createAccount();
      mockService.findPrimaryByUser.mockResolvedValue(account);

      const result = await controller.findPrimaryByUser('user-1');

      expect(result.id).toBe('acc-1');
      expect(mockService.findPrimaryByUser).toHaveBeenCalledWith('user-1');
    });
  });
});
