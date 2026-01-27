import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    // Si es una HttpException de NestJS (400, 404, etc.)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      return response.status(status).json(exceptionResponse);
    }

    // Debug: ver estructura del error
    this.logger.debug('Exception structure:', JSON.stringify({
      name: (exception as any)?.name,
      code: (exception as any)?.code,
      hasOriginalError: !!(exception as any)?.originalError,
      originalErrorCode: (exception as any)?.originalError?.code,
      keys: Object.keys(exception as any || {}),
    }, null, 2));

    // Manejar errores de base de datos (PostgreSQL/Knex)
    if (this.isDatabaseError(exception)) {
      const dbError = this.handleDatabaseError(exception);

      this.logger.error(
        `Database error: ${dbError.message}`,
        (exception as any).stack,
      );

      return response.status(dbError.status).json({
        statusCode: dbError.status,
        message: dbError.message,
        error: dbError.error,
      });
    }

    // Error genérico no manejado
    this.logger.error(
      `Unhandled exception: ${(exception as any)?.message}`,
      (exception as any)?.stack,
    );

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'InternalServerError',
    });
  }

  private isDatabaseError(exception: unknown): boolean {
    if (typeof exception !== 'object' || exception === null) {
      return false;
    }

    // Check if it's a direct PostgreSQL error
    if ('code' in exception || 'routine' in exception) {
      return true;
    }

    // Check if it's a Knex error wrapping a PostgreSQL error
    const knexError = exception as any;
    if (knexError.originalError && typeof knexError.originalError === 'object') {
      return 'code' in knexError.originalError || 'routine' in knexError.originalError;
    }

    // Check if error message contains PostgreSQL patterns
    const message = (exception as Error).message || '';
    if (
      message.includes('violates unique constraint') ||
      message.includes('violates foreign key constraint') ||
      message.includes('violates check constraint') ||
      message.includes('invalid input syntax')
    ) {
      return true;
    }

    return false;
  }

  private handleDatabaseError(exception: any): {
    status: number;
    message: string;
    error: string;
  } {
    // Extract the actual PostgreSQL error (might be wrapped by Knex)
    const pgError = exception.originalError || exception;
    const errorMessage = pgError.message || exception.message || '';

    // Try to match by error code first
    if (pgError.code) {
      switch (pgError.code) {
        case '23505':
          return {
            status: HttpStatus.CONFLICT,
            message: this.parseUniqueViolation(pgError),
            error: 'Conflict',
          };
        case '23503':
          return {
            status: HttpStatus.BAD_REQUEST,
            message: 'Referenced resource does not exist',
            error: 'BadRequest',
          };
        case '23502':
          return {
            status: HttpStatus.BAD_REQUEST,
            message: `Field '${pgError.column}' is required`,
            error: 'BadRequest',
          };
        case '23514':
          return {
            status: HttpStatus.BAD_REQUEST,
            message: this.parseCheckConstraintViolation(pgError),
            error: 'BadRequest',
          };
        case '22P02':
          return {
            status: HttpStatus.BAD_REQUEST,
            message: this.parseInvalidTextRepresentation(pgError),
            error: 'BadRequest',
          };
        case 'ECONNREFUSED':
        case 'ETIMEDOUT':
          return {
            status: HttpStatus.SERVICE_UNAVAILABLE,
            message: 'Database connection error',
            error: 'ServiceUnavailable',
          };
      }
    }

    // Fallback: parse from error message (Knex wraps errors without preserving code)
    if (errorMessage.includes('violates unique constraint')) {
      return {
        status: HttpStatus.CONFLICT,
        message: this.parseUniqueViolationFromMessage(errorMessage),
        error: 'Conflict',
      };
    }

    if (errorMessage.includes('violates foreign key constraint')) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Referenced resource does not exist',
        error: 'BadRequest',
      };
    }

    if (errorMessage.includes('violates check constraint')) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: this.parseCheckConstraintFromMessage(errorMessage),
        error: 'BadRequest',
      };
    }

    if (errorMessage.includes('invalid input syntax')) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: this.parseInvalidSyntaxFromMessage(errorMessage),
        error: 'BadRequest',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Database error occurred',
      error: 'InternalServerError',
    };
  }

  private parseUniqueViolationFromMessage(message: string): string {
    // Extract constraint name from: violates unique constraint "idx_accounts_user_currency"
    const match = message.match(/violates unique constraint "([^"]+)"/);
    if (match) {
      const constraint = match[1];
      const constraintMessages: Record<string, string> = {
        idx_accounts_user_currency: 'An account with this currency already exists for this user',
        idx_accounts_user_primary: 'User already has a primary account',
      };
      return constraintMessages[constraint] || 'Duplicate entry detected';
    }
    return 'Duplicate entry detected';
  }

  private parseCheckConstraintFromMessage(message: string): string {
    const match = message.match(/violates check constraint "([^"]+)"/);
    if (match) {
      const constraint = match[1];
      const constraintMessages: Record<string, string> = {
        accounts_balance_non_negative: 'Account balance cannot be negative',
        accounts_reserved_balance_non_negative: 'Reserved balance cannot be negative',
        accounts_available_balance_valid: 'Insufficient funds (reserved exceeds balance)',
      };
      return constraintMessages[constraint] || 'Constraint violation occurred';
    }
    return 'Constraint violation occurred';
  }

  private parseInvalidSyntaxFromMessage(message: string): string {
    if (message.includes('uuid')) {
      return 'Invalid UUID format provided';
    }
    if (message.includes('integer')) {
      return 'Invalid integer value provided';
    }
    if (message.includes('numeric')) {
      return 'Invalid numeric value provided';
    }
    return 'Invalid data format provided';
  }

  private parseUniqueViolation(exception: any): string {
    const detail = exception.detail || '';

    // Extract field from: Key (email)=(test@test.com) already exists.
    const match = detail.match(/Key \((.*?)\)=/);
    if (match) {
      return `${match[1]} already exists`;
    }

    // Extract from constraint name
    if (exception.constraint) {
      // idx_accounts_user_currency -> user and currency combination already exists
      if (exception.constraint === 'idx_accounts_user_currency') {
        return 'An account with this currency already exists for this user';
      }
      if (exception.constraint === 'idx_accounts_user_primary') {
        return 'User already has a primary account';
      }
    }

    return 'Duplicate entry detected';
  }

  private parseCheckConstraintViolation(exception: any): string {
    const constraint = exception.constraint || '';

    // Map constraint names to friendly messages
    const constraintMessages: Record<string, string> = {
      accounts_balance_non_negative: 'Account balance cannot be negative',
      accounts_reserved_balance_non_negative: 'Reserved balance cannot be negative',
      accounts_available_balance_valid: 'Available balance cannot be negative (reserved exceeds balance)',
    };

    return constraintMessages[constraint] || 'Constraint violation occurred';
  }

  private parseInvalidTextRepresentation(exception: any): string {
    const message = exception.message || '';

    // Extract type from error message
    if (message.includes('uuid')) {
      return 'Invalid UUID format provided';
    }
    if (message.includes('integer')) {
      return 'Invalid integer value provided';
    }
    if (message.includes('numeric')) {
      return 'Invalid numeric value provided';
    }

    return 'Invalid data format provided';
  }
}
