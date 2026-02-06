import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PaymentsService } from '../domain/payments.service';
import { CreatePaymentDto } from '../domain/dto/create-payment.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreatePaymentDto) {
    return this.paymentsService.createPayment(dto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.paymentsService.findById(id);
  }

  @Get('account/:accountId')
  async findByAccountId(@Param('accountId') accountId: string) {
    return this.paymentsService.findByAccountId(accountId);
  }
}
