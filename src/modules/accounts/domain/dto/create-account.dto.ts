import { IsEnum, IsUUID } from 'class-validator';
import { Currency } from '../account.entity';

export class CreateAccountDto {
  @IsUUID('4', { message: 'userId must be a valid UUID v4' })
  userId: string;

  @IsEnum(Currency, { message: 'currency must be one of: USD, EUR, ARS, GBP' })
  currency: Currency;
}
