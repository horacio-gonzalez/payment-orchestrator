import { Transaction } from './transaction.entity';
import { TransactionType } from './transaction.types';

describe('Transaction', () => {
  it('should construct with partial data', () => {
    const tx = new Transaction({
      id: 'tx-1',
      accountId: 'acc-1',
      amount: 100,
      type: TransactionType.CREDIT,
    });

    expect(tx.id).toBe('tx-1');
    expect(tx.amount).toBe(100);
    expect(tx.type).toBe(TransactionType.CREDIT);
  });

  describe('isCredit', () => {
    it('should return true for credit transactions', () => {
      const tx = new Transaction({ type: TransactionType.CREDIT });
      expect(tx.isCredit()).toBe(true);
    });

    it('should return false for non-credit transactions', () => {
      const tx = new Transaction({ type: TransactionType.DEBIT });
      expect(tx.isCredit()).toBe(false);
    });
  });

  describe('isDebit', () => {
    it('should return true for debit transactions', () => {
      const tx = new Transaction({ type: TransactionType.DEBIT });
      expect(tx.isDebit()).toBe(true);
    });

    it('should return false for non-debit transactions', () => {
      const tx = new Transaction({ type: TransactionType.CREDIT });
      expect(tx.isDebit()).toBe(false);
    });
  });
});
