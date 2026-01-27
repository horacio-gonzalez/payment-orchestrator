import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AccountsService } from '../domain/accounts.service';
import { CreateAccountDto } from '../domain/dto/create-account.dto';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) { }

  /**
   * POST /accounts
   * Create a new account for a user
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateAccountDto) {
    const account = await this.accountsService.createAccount(dto.userId, dto.currency);

    return {
      id: account.id,
      userId: account.userId,
      balance: account.balance,
      reservedBalance: account.reservedBalance,
      availableBalance: account.availableBalance,
      currency: account.currency,
      status: account.status,
      isPrimary: account.isPrimary,
      createdAt: account.createdAt,
    };
  }

  /**
   * GET /accounts/:id
   * Get account by ID
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const account = await this.accountsService.findById(id);

    return {
      id: account.id,
      userId: account.userId,
      balance: account.balance,
      reservedBalance: account.reservedBalance,
      availableBalance: account.availableBalance,
      currency: account.currency,
      status: account.status,
      isPrimary: account.isPrimary,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }

  /**
   * GET /accounts/user/:userId/primary
   * Get primary account for a user
   */
  @Get('user/:userId/primary')
  async findPrimaryByUser(@Param('userId') userId: string) {
    const account = await this.accountsService.findPrimaryByUser(userId);

    return {
      id: account.id,
      userId: account.userId,
      balance: account.balance,
      reservedBalance: account.reservedBalance,
      availableBalance: account.availableBalance,
      currency: account.currency,
      status: account.status,
      isPrimary: account.isPrimary,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }
}
