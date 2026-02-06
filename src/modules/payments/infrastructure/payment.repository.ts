import { Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { Payment } from '../domain/payment.entity';
import { PaymentMapper, PaymentRow } from './payment.mapper';
import { PaymentStatus } from '../domain/payment.types';

@Injectable()
export class PaymentRepository {
  constructor(@Inject('KNEX') private readonly knex: Knex) { }

  async findById(id: string): Promise<Payment | null> {
    const row = await this.knex<PaymentRow>('payments').where({ id }).first();

    return row ? PaymentMapper.toDomain(row) : null;
  }

  async findByExternalPaymentId(externalPaymentId: string): Promise<Payment | null> {
    const row = await this.knex<PaymentRow>('payments')
      .where({ external_payment_id: externalPaymentId })
      .first();

    return row ? PaymentMapper.toDomain(row) : null;
  }

  async findByAccountId(accountId: string): Promise<Payment[]> {
    const rows = await this.knex<PaymentRow>('payments')
      .where({ account_id: accountId })
      .orderBy('created_at', 'desc');

    return PaymentMapper.toDomainList(rows);
  }

  async create(payment: Payment): Promise<Payment> {
    const row = PaymentMapper.toPersistence(payment);

    const [inserted] = await this.knex<PaymentRow>('payments')
      .insert(row)
      .returning('*');

    return PaymentMapper.toDomain(inserted);
  }

  async updateStatus(
    id: string,
    status: PaymentStatus,
    trx?: Knex.Transaction, // Opcional: usar transaction externa
  ): Promise<void> {
    const db = trx || this.knex;

    await db('payments')
      .update({
        status,
        updated_at: new Date(),
      })
      .where({ id });
  }

  // Con FOR UPDATE (critical)
  async findByIdForUpdate(
    id: string,
    trx: Knex.Transaction,
  ): Promise<Payment | null> {
    const row = await trx<PaymentRow>('payments')
      .where({ id })
      .forUpdate() // ← Pessimistic lock
      .first();

    return row ? PaymentMapper.toDomain(row) : null;
  }
}
