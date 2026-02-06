import { Controller, Get, Param } from '@nestjs/common';
import { TransactionsService } from '../domain/transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) { }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.transactionsService.findById(id);
  }

  @Get('account/:accountId')
  async findByAccountId(@Param('accountId') accountId: string) {
    return this.transactionsService.findByAccountId(accountId);
  }
}
