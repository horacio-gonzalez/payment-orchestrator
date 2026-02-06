import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { PaymentRepository } from '../infrastructure/payment.repository';
import { Payment } from './payment.entity';
import { PaymentStatus, CreatePaymentData } from './payment.types';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    @Inject('KNEX') private readonly knex: Knex,
  ) { }

  async createPayment(data: CreatePaymentData): Promise<Payment> {
    const now = new Date();
    const payment = new Payment({
      id: randomUUID(),
      accountId: data.accountId,
      amount: data.amount,
      currency: data.currency,
      status: PaymentStatus.PENDING,
      provider: data.provider,
      externalPaymentId: data.externalPaymentId,
      paymentMethod: data.paymentMethod ?? null,
      description: data.description ?? null,
      metadata: data.metadata ?? {},
      createdAt: now,
      updatedAt: now,
      processedAt: null,
    });

    return this.paymentRepository.create(payment);
  }

  async findById(id: string): Promise<Payment> {
    const payment = await this.paymentRepository.findById(id);
    if (!payment) {
      throw new NotFoundException(`Payment ${id} not found`);
    }
    return payment;
  }

  async findByAccountId(accountId: string): Promise<Payment[]> {
    return this.paymentRepository.findByAccountId(accountId);
  }

  async findByExternalPaymentId(externalPaymentId: string): Promise<Payment | null> {
    return this.paymentRepository.findByExternalPaymentId(externalPaymentId);
  }

  async updateStatus(id: string, newStatus: PaymentStatus, trx?: Knex.Transaction): Promise<void> {
    const payment = trx
      ? await this.paymentRepository.findByIdForUpdate(id, trx)
      : await this.paymentRepository.findById(id);

    if (!payment) {
      throw new NotFoundException(`Payment ${id} not found`);
    }

    if (!payment.canTransitionTo(newStatus)) {
      throw new BadRequestException(
        `Cannot transition payment from ${payment.status} to ${newStatus}`,
      );
    }

    await this.paymentRepository.updateStatus(id, newStatus, trx);
  }
}
