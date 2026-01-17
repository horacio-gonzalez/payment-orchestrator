import { Module } from '@nestjs/common';
import { PaymentsService } from './domain/payments.service';
import { PaymentsController } from './api/payments.controller';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
