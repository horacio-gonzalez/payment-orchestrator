import { Module } from '@nestjs/common';
import { TransactionsService } from './domain/transactions.service';
import { TransactionsController } from './api/transactions.controller';
import { TransactionsRepository } from './infrastructure/transactions.repository';
import { ITransactionsRepository } from './domain/i-transactions.repository';

@Module({
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    {
      provide: ITransactionsRepository,
      useClass: TransactionsRepository,
    },
  ],
  exports: [TransactionsService, ITransactionsRepository],
})
export class TransactionsModule { }
