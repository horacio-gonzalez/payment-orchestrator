export class WebhookReceivedResponseDto {
  received: boolean;
  webhookId: string;
  duplicate?: boolean;
  message?: string;
}

export class WebhookErrorResponseDto {
  error: string;
  message: string;
  statusCode: number;
  timestamp: string;
}

export class WebhookValidationErrorDto {
  error: 'validation_failed';
  message: string;
  details?: string[];
}
