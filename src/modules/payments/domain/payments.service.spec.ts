import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentRepository } from '../infrastructure/payment.repository';
import { Payment } from './payment.entity';
import { PaymentStatus } from './payment.types';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let paymentRepository: Record<string, jest.Mock>;

  beforeEach(async () => {
    paymentRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByAccountId: jest.fn(),
      findByExternalPaymentId: jest.fn(),
      updateStatus: jest.fn(),
      findByIdForUpdate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PaymentRepository, useValue: paymentRepository },
        { provide: 'KNEX', useValue: {} },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  describe('createPayment', () => {
    it('should call repo.create with correct data and return the created payment', async () => {
      const data = {
        accountId: 'acc-1',
        amount: 1000,
        currency: 'USD',
        provider: 'stripe',
        externalPaymentId: 'ext-123',
        paymentMethod: 'card',
        description: 'Test payment',
        metadata: { key: 'value' },
      };

      const createdPayment = new Payment({
        id: 'pay-1',
        ...data,
        status: PaymentStatus.PENDING,
        paymentMethod: data.paymentMethod,
        description: data.description,
        metadata: data.metadata,
        createdAt: new Date(),
        updatedAt: new Date(),
        processedAt: null,
      });

      paymentRepository.create.mockResolvedValue(createdPayment);

      const result = await service.createPayment(data);

      expect(paymentRepository.create).toHaveBeenCalledTimes(1);
      const calledWith = paymentRepository.create.mock.calls[0][0] as Payment;
      expect(calledWith).toBeInstanceOf(Payment);
      expect(calledWith.accountId).toBe(data.accountId);
      expect(calledWith.amount).toBe(data.amount);
      expect(calledWith.currency).toBe(data.currency);
      expect(calledWith.status).toBe(PaymentStatus.PENDING);
      expect(calledWith.provider).toBe(data.provider);
      expect(calledWith.externalPaymentId).toBe(data.externalPaymentId);
      expect(calledWith.paymentMethod).toBe(data.paymentMethod);
      expect(calledWith.description).toBe(data.description);
      expect(calledWith.metadata).toEqual(data.metadata);
      expect(calledWith.processedAt).toBeNull();
      expect(result).toBe(createdPayment);
    });

    it('should default optional fields when not provided', async () => {
      const data = {
        accountId: 'acc-1',
        amount: 500,
        currency: 'EUR',
        provider: 'paypal',
        externalPaymentId: 'ext-456',
      };

      paymentRepository.create.mockResolvedValue(new Payment(data));

      await service.createPayment(data);

      const calledWith = paymentRepository.create.mock.calls[0][0] as Payment;
      expect(calledWith.paymentMethod).toBeNull();
      expect(calledWith.description).toBeNull();
      expect(calledWith.metadata).toEqual({});
    });
  });

  describe('findById', () => {
    it('should return the payment when found', async () => {
      const payment = new Payment({
        id: 'pay-1',
        accountId: 'acc-1',
        amount: 1000,
        status: PaymentStatus.PENDING,
      });

      paymentRepository.findById.mockResolvedValue(payment);

      const result = await service.findById('pay-1');

      expect(paymentRepository.findById).toHaveBeenCalledWith('pay-1');
      expect(result).toBe(payment);
    });

    it('should throw NotFoundException when payment is not found', async () => {
      paymentRepository.findById.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByAccountId', () => {
    it('should delegate to repository', async () => {
      const payments = [
        new Payment({ id: 'pay-1', accountId: 'acc-1' }),
        new Payment({ id: 'pay-2', accountId: 'acc-1' }),
      ];

      paymentRepository.findByAccountId.mockResolvedValue(payments);

      const result = await service.findByAccountId('acc-1');

      expect(paymentRepository.findByAccountId).toHaveBeenCalledWith('acc-1');
      expect(result).toBe(payments);
    });
  });

  describe('findByExternalPaymentId', () => {
    it('should delegate to repository', async () => {
      const payment = new Payment({
        id: 'pay-1',
        externalPaymentId: 'ext-123',
      });

      paymentRepository.findByExternalPaymentId.mockResolvedValue(payment);

      const result = await service.findByExternalPaymentId('ext-123');

      expect(paymentRepository.findByExternalPaymentId).toHaveBeenCalledWith(
        'ext-123',
      );
      expect(result).toBe(payment);
    });
  });

  describe('updateStatus', () => {
    it('should call repo.updateStatus for a valid transition', async () => {
      const payment = new Payment({
        id: 'pay-1',
        status: PaymentStatus.PENDING,
      });

      paymentRepository.findById.mockResolvedValue(payment);
      paymentRepository.updateStatus.mockResolvedValue(undefined);

      await service.updateStatus('pay-1', PaymentStatus.PROCESSING);

      expect(paymentRepository.findById).toHaveBeenCalledWith('pay-1');
      expect(paymentRepository.updateStatus).toHaveBeenCalledWith(
        'pay-1',
        PaymentStatus.PROCESSING,
        undefined,
      );
    });

    it('should use findByIdForUpdate when a transaction is provided', async () => {
      const payment = new Payment({
        id: 'pay-1',
        status: PaymentStatus.PENDING,
      });
      const mockTrx = {} as any;

      paymentRepository.findByIdForUpdate.mockResolvedValue(payment);
      paymentRepository.updateStatus.mockResolvedValue(undefined);

      await service.updateStatus('pay-1', PaymentStatus.PROCESSING, mockTrx);

      expect(paymentRepository.findByIdForUpdate).toHaveBeenCalledWith(
        'pay-1',
        mockTrx,
      );
      expect(paymentRepository.findById).not.toHaveBeenCalled();
      expect(paymentRepository.updateStatus).toHaveBeenCalledWith(
        'pay-1',
        PaymentStatus.PROCESSING,
        mockTrx,
      );
    });

    it('should throw BadRequestException for an invalid transition', async () => {
      const payment = new Payment({
        id: 'pay-1',
        status: PaymentStatus.PENDING,
      });

      paymentRepository.findById.mockResolvedValue(payment);

      await expect(
        service.updateStatus('pay-1', PaymentStatus.SUCCEEDED),
      ).rejects.toThrow(BadRequestException);

      expect(paymentRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when payment is not found', async () => {
      paymentRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateStatus('non-existent', PaymentStatus.PROCESSING),
      ).rejects.toThrow(NotFoundException);

      expect(paymentRepository.updateStatus).not.toHaveBeenCalled();
    });
  });
});
