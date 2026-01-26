import { Module } from '@nestjs/common';
import { PaymentsService } from './domain/payments.service';
import { PaymentsController } from './api/payments.controller';
import { PaymentRepository } from './infrastructure/payment.repository';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentRepository],
  exports: [PaymentsService, PaymentRepository],
})
export class PaymentsModule { }
