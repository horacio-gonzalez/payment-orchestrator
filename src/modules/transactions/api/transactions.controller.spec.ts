import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from '../domain/transactions.service';
import { Transaction } from '../domain/transaction.entity';
import { TransactionType } from '../domain/transaction.types';

describe('TransactionsController', () => {
  let controller: TransactionsController;
  let mockService: jest.Mocked<TransactionsService>;

  const mockTransaction = new Transaction({
    id: 'tx-1',
    accountId: 'acc-1',
    amount: 100,
    type: TransactionType.CREDIT,
    referenceId: 'pay-1',
    referenceType: 'payment',
    createdAt: new Date(),
  });

  beforeEach(async () => {
    mockService = {
      findById: jest.fn(),
      findByAccountId: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionsController],
      providers: [{ provide: TransactionsService, useValue: mockService }],
    }).compile();

    controller = module.get<TransactionsController>(TransactionsController);
  });

  describe('findOne', () => {
    it('should return transaction by ID', async () => {
      mockService.findById.mockResolvedValue(mockTransaction);

      const result = await controller.findOne('tx-1');

      expect(result).toBe(mockTransaction);
      expect(mockService.findById).toHaveBeenCalledWith('tx-1');
    });
  });

  describe('findByAccountId', () => {
    it('should return transactions by account ID', async () => {
      mockService.findByAccountId.mockResolvedValue([mockTransaction]);

      const result = await controller.findByAccountId('acc-1');

      expect(result).toEqual([mockTransaction]);
      expect(mockService.findByAccountId).toHaveBeenCalledWith('acc-1');
    });
  });
});
