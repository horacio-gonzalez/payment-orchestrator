import { Injectable, Inject } from '@nestjs/common';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { IAccountsRepository } from './i-accounts.repository';

@Injectable()
export class AccountsService {
  constructor(private accountsRepository: IAccountsRepository) { }

  async create(createAccountDto: CreateAccountDto) {
    let a = await this.accountsRepository.findById("");
    return 'This action adds a new account';
  }

  findAll() {
    return `This action returns all accounts`;
  }

  findOne(id: number) {
    return `This action returns a #${id} account`;
  }

  update(id: number, updateAccountDto: UpdateAccountDto) {
    return `This action updates a #${id} account`;
  }

  remove(id: number) {
    return `This action removes a #${id} account`;
  }
}
