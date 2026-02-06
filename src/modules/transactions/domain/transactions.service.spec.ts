import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { ITransactionsRepository } from './i-transactions.repository';
import { Transaction } from './transaction.entity';
import { TransactionType } from './transaction.types';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let transactionsRepository: Record<string, jest.Mock>;

  beforeEach(async () => {
    transactionsRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByAccountId: jest.fn(),
      findByReferenceId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: ITransactionsRepository, useValue: transactionsRepository },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
  });

  describe('recordCredit', () => {
    it('should call create with positive amount and CREDIT type', async () => {
      const mockTrx = {} as any;
      const createdTransaction = new Transaction({
        id: 'txn-1',
        accountId: 'acc-1',
        amount: 500,
        type: TransactionType.CREDIT,
        referenceId: 'ref-1',
        referenceType: 'payment',
        description: 'Credit description',
      });

      transactionsRepository.create.mockResolvedValue(createdTransaction);

      const result = await service.recordCredit(
        'acc-1',
        500,
        'ref-1',
        'payment',
        mockTrx,
        'Credit description',
      );

      expect(transactionsRepository.create).toHaveBeenCalledWith(
        {
          accountId: 'acc-1',
          amount: 500,
          type: TransactionType.CREDIT,
          referenceId: 'ref-1',
          referenceType: 'payment',
          description: 'Credit description',
        },
        mockTrx,
      );
      expect(result).toBe(createdTransaction);
    });

    it('should call create without description when not provided', async () => {
      const mockTrx = {} as any;
      transactionsRepository.create.mockResolvedValue(new Transaction({}));

      await service.recordCredit('acc-1', 100, 'ref-1', 'payment', mockTrx);

      expect(transactionsRepository.create).toHaveBeenCalledWith(
        {
          accountId: 'acc-1',
          amount: 100,
          type: TransactionType.CREDIT,
          referenceId: 'ref-1',
          referenceType: 'payment',
          description: undefined,
        },
        mockTrx,
      );
    });
  });

  describe('recordDebit', () => {
    it('should call create with negative amount and DEBIT type', async () => {
      const mockTrx = {} as any;
      const createdTransaction = new Transaction({
        id: 'txn-2',
        accountId: 'acc-1',
        amount: -300,
        type: TransactionType.DEBIT,
        referenceId: 'ref-2',
        referenceType: 'payment',
        description: 'Debit description',
      });

      transactionsRepository.create.mockResolvedValue(createdTransaction);

      const result = await service.recordDebit(
        'acc-1',
        300,
        'ref-2',
        'payment',
        mockTrx,
        'Debit description',
      );

      expect(transactionsRepository.create).toHaveBeenCalledWith(
        {
          accountId: 'acc-1',
          amount: -300,
          type: TransactionType.DEBIT,
          referenceId: 'ref-2',
          referenceType: 'payment',
          description: 'Debit description',
        },
        mockTrx,
      );
      expect(result).toBe(createdTransaction);
    });
  });

  describe('recordReserve', () => {
    it('should call create with negative amount and RESERVE type', async () => {
      const mockTrx = {} as any;
      transactionsRepository.create.mockResolvedValue(new Transaction({}));

      await service.recordReserve('acc-1', 200, 'ref-3', 'payment', mockTrx);

      expect(transactionsRepository.create).toHaveBeenCalledWith(
        {
          accountId: 'acc-1',
          amount: -200,
          type: TransactionType.RESERVE,
          referenceId: 'ref-3',
          referenceType: 'payment',
        },
        mockTrx,
      );
    });
  });

  describe('recordRelease', () => {
    it('should call create with positive amount and RELEASE type', async () => {
      const mockTrx = {} as any;
      transactionsRepository.create.mockResolvedValue(new Transaction({}));

      await service.recordRelease('acc-1', 200, 'ref-4', 'payment', mockTrx);

      expect(transactionsRepository.create).toHaveBeenCalledWith(
        {
          accountId: 'acc-1',
          amount: 200,
          type: TransactionType.RELEASE,
          referenceId: 'ref-4',
          referenceType: 'payment',
        },
        mockTrx,
      );
    });
  });

  describe('findById', () => {
    it('should return the transaction when found', async () => {
      const transaction = new Transaction({
        id: 'txn-1',
        accountId: 'acc-1',
        amount: 500,
        type: TransactionType.CREDIT,
      });

      transactionsRepository.findById.mockResolvedValue(transaction);

      const result = await service.findById('txn-1');

      expect(transactionsRepository.findById).toHaveBeenCalledWith('txn-1');
      expect(result).toBe(transaction);
    });

    it('should throw NotFoundException when transaction is not found', async () => {
      transactionsRepository.findById.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByAccountId', () => {
    it('should delegate to repository', async () => {
      const transactions = [
        new Transaction({ id: 'txn-1', accountId: 'acc-1' }),
        new Transaction({ id: 'txn-2', accountId: 'acc-1' }),
      ];

      transactionsRepository.findByAccountId.mockResolvedValue(transactions);

      const result = await service.findByAccountId('acc-1');

      expect(transactionsRepository.findByAccountId).toHaveBeenCalledWith(
        'acc-1',
      );
      expect(result).toBe(transactions);
    });
  });

  describe('findByReferenceId', () => {
    it('should delegate to repository', async () => {
      const transactions = [
        new Transaction({ id: 'txn-1', referenceId: 'ref-1' }),
      ];

      transactionsRepository.findByReferenceId.mockResolvedValue(transactions);

      const result = await service.findByReferenceId('ref-1');

      expect(transactionsRepository.findByReferenceId).toHaveBeenCalledWith(
        'ref-1',
      );
      expect(result).toBe(transactions);
    });
  });
});
