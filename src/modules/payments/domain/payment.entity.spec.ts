import { Payment } from './payment.entity';
import { PaymentStatus } from './payment.types';

describe('Payment Entity', () => {
  const baseData = {
    id: 'pay_123',
    accountId: 'acc_456',
    amount: 100,
    currency: 'USD',
    status: PaymentStatus.PENDING,
    provider: 'stripe',
    externalPaymentId: 'ext_789',
    paymentMethod: 'card',
    description: 'Test payment',
    metadata: { orderId: 'ord_1' },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    processedAt: null,
  };

  describe('constructor', () => {
    it('should assign all properties from data', () => {
      const payment = new Payment(baseData);

      expect(payment.id).toBe('pay_123');
      expect(payment.accountId).toBe('acc_456');
      expect(payment.amount).toBe(100);
      expect(payment.currency).toBe('USD');
      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(payment.provider).toBe('stripe');
      expect(payment.externalPaymentId).toBe('ext_789');
      expect(payment.paymentMethod).toBe('card');
      expect(payment.description).toBe('Test payment');
      expect(payment.metadata).toEqual({ orderId: 'ord_1' });
      expect(payment.processedAt).toBeNull();
    });

    it('should allow partial data', () => {
      const payment = new Payment({ id: 'pay_1', amount: 50 });

      expect(payment.id).toBe('pay_1');
      expect(payment.amount).toBe(50);
      expect(payment.status).toBeUndefined();
    });
  });

  describe('isSucceeded', () => {
    it('should return true when status is SUCCEEDED', () => {
      const payment = new Payment({ ...baseData, status: PaymentStatus.SUCCEEDED });
      expect(payment.isSucceeded()).toBe(true);
    });

    it.each([
      PaymentStatus.PENDING,
      PaymentStatus.PROCESSING,
      PaymentStatus.FAILED,
      PaymentStatus.REFUNDED,
      PaymentStatus.CANCELLED,
    ])('should return false when status is %s', (status) => {
      const payment = new Payment({ ...baseData, status });
      expect(payment.isSucceeded()).toBe(false);
    });
  });

  describe('canBeRefunded', () => {
    it('should return true when succeeded and amount > 0', () => {
      const payment = new Payment({
        ...baseData,
        status: PaymentStatus.SUCCEEDED,
        amount: 100,
      });
      expect(payment.canBeRefunded()).toBe(true);
    });

    it('should return false when succeeded but amount is 0', () => {
      const payment = new Payment({
        ...baseData,
        status: PaymentStatus.SUCCEEDED,
        amount: 0,
      });
      expect(payment.canBeRefunded()).toBe(false);
    });

    it('should return false when not succeeded', () => {
      const payment = new Payment({
        ...baseData,
        status: PaymentStatus.PENDING,
        amount: 100,
      });
      expect(payment.canBeRefunded()).toBe(false);
    });

    it('should return false when failed with positive amount', () => {
      const payment = new Payment({
        ...baseData,
        status: PaymentStatus.FAILED,
        amount: 50,
      });
      expect(payment.canBeRefunded()).toBe(false);
    });
  });

  describe('canTransitionTo', () => {
    describe('valid transitions', () => {
      it.each([
        [PaymentStatus.PENDING, PaymentStatus.PROCESSING],
        [PaymentStatus.PENDING, PaymentStatus.CANCELLED],
        [PaymentStatus.PROCESSING, PaymentStatus.SUCCEEDED],
        [PaymentStatus.PROCESSING, PaymentStatus.FAILED],
        [PaymentStatus.SUCCEEDED, PaymentStatus.REFUNDED],
        [PaymentStatus.FAILED, PaymentStatus.PENDING],
      ])('should allow %s -> %s', (from, to) => {
        const payment = new Payment({ ...baseData, status: from });
        expect(payment.canTransitionTo(to)).toBe(true);
      });
    });

    describe('invalid transitions', () => {
      it.each([
        [PaymentStatus.PENDING, PaymentStatus.SUCCEEDED],
        [PaymentStatus.PENDING, PaymentStatus.FAILED],
        [PaymentStatus.PENDING, PaymentStatus.REFUNDED],
        [PaymentStatus.PROCESSING, PaymentStatus.PENDING],
        [PaymentStatus.PROCESSING, PaymentStatus.CANCELLED],
        [PaymentStatus.SUCCEEDED, PaymentStatus.PENDING],
        [PaymentStatus.SUCCEEDED, PaymentStatus.FAILED],
        [PaymentStatus.FAILED, PaymentStatus.SUCCEEDED],
        [PaymentStatus.REFUNDED, PaymentStatus.PENDING],
        [PaymentStatus.REFUNDED, PaymentStatus.SUCCEEDED],
        [PaymentStatus.CANCELLED, PaymentStatus.PENDING],
        [PaymentStatus.CANCELLED, PaymentStatus.PROCESSING],
      ])('should reject %s -> %s', (from, to) => {
        const payment = new Payment({ ...baseData, status: from });
        expect(payment.canTransitionTo(to)).toBe(false);
      });
    });

    describe('terminal states', () => {
      it('should not allow any transition from REFUNDED', () => {
        const payment = new Payment({ ...baseData, status: PaymentStatus.REFUNDED });
        const allStatuses = Object.values(PaymentStatus);
        allStatuses.forEach((status) => {
          expect(payment.canTransitionTo(status)).toBe(false);
        });
      });

      it('should not allow any transition from CANCELLED', () => {
        const payment = new Payment({ ...baseData, status: PaymentStatus.CANCELLED });
        const allStatuses = Object.values(PaymentStatus);
        allStatuses.forEach((status) => {
          expect(payment.canTransitionTo(status)).toBe(false);
        });
      });
    });
  });
});
