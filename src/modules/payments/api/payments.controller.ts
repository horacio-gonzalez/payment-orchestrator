import { Controller } from '@nestjs/common';
import { PaymentsService } from '../domain/payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}
}
