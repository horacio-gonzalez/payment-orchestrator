import { IsString, IsNumber, IsPositive, IsOptional, IsObject, IsUUID } from 'class-validator';

export class CreatePaymentDto {
  @IsUUID('4')
  accountId: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  currency: string;

  @IsString()
  provider: string;

  @IsString()
  externalPaymentId: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
