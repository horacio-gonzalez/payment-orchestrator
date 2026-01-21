import { Module } from '@nestjs/common';
import { AccountsService } from './domain/accounts.service';
import { AccountsController } from './api/accounts.controller';
import { AccountsRepository } from './infrastructure/accounts.repository';

@Module({
  controllers: [AccountsController],
  providers: [
    AccountsService,
    {
      provide: 'IAccountsRepository', // Token
      useClass: AccountsRepository, // Implementación
    },
  ],
})
export class AccountsModule {}
