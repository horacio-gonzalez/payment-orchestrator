import { Module } from '@nestjs/common';
import { AccountsService } from './domain/accounts.service';
import { AccountsController } from './api/accounts.controller';
import { AccountsRepository } from './infrastructure/accounts.repository';
import { IAccountsRepository } from './domain/i-accounts.repository';
@Module({
  controllers: [AccountsController],
  providers: [
    AccountsService,
    {
      provide: IAccountsRepository,
      useClass: AccountsRepository,
    },
  ],
})
export class AccountsModule { }
