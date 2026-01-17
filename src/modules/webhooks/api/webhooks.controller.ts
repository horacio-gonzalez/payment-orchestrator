import { Controller } from '@nestjs/common';
import { WebhooksService } from '../domain/webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}
}
