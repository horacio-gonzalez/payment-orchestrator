import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from '../domain/payments.service';
import { Payment } from '../domain/payment.entity';
import { PaymentStatus } from '../domain/payment.types';

describe('PaymentsController', () => {
  let controller: PaymentsController;
  let mockService: jest.Mocked<PaymentsService>;

  const mockPayment = new Payment({
    id: 'pay-1',
    accountId: 'acc-1',
    amount: 100,
    currency: 'USD',
    status: PaymentStatus.PENDING,
    provider: 'stripe',
    externalPaymentId: 'pi_123',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(async () => {
    mockService = {
      createPayment: jest.fn(),
      findById: jest.fn(),
      findByAccountId: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: mockService }],
    }).compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  describe('create', () => {
    it('should create payment', async () => {
      mockService.createPayment.mockResolvedValue(mockPayment);

      const result = await controller.create({
        accountId: 'acc-1',
        amount: 100,
        currency: 'USD',
        provider: 'stripe',
        externalPaymentId: 'pi_123',
      });

      expect(result).toBe(mockPayment);
    });
  });

  describe('findOne', () => {
    it('should return payment by ID', async () => {
      mockService.findById.mockResolvedValue(mockPayment);

      const result = await controller.findOne('pay-1');

      expect(result).toBe(mockPayment);
      expect(mockService.findById).toHaveBeenCalledWith('pay-1');
    });
  });

  describe('findByAccountId', () => {
    it('should return payments by account ID', async () => {
      mockService.findByAccountId.mockResolvedValue([mockPayment]);

      const result = await controller.findByAccountId('acc-1');

      expect(result).toEqual([mockPayment]);
      expect(mockService.findByAccountId).toHaveBeenCalledWith('acc-1');
    });
  });
});
