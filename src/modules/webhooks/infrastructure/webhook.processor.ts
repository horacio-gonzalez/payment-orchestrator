import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger, Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { PaymentRepository } from '../../payments/infrastructure/payment.repository';
import { PaymentStatus } from '../../payments/domain/payment.types';
import { StripeWebhookDto } from '../domain/dto';

@Injectable()
@Processor('webhook-processing')
export class WebhookProcessor {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    @Inject('KNEX') private readonly knex: Knex,
    private readonly paymentRepository: PaymentRepository,
  ) { }

  @Process('process-payment-webhook')
  async processPaymentWebhook(job: Job): Promise<void> {
    const { webhookEventId, payload } = job.data;
    const dto = payload as StripeWebhookDto;

    this.logger.log(
      `Processing webhook job ${job.id} for event ${webhookEventId}, type: ${dto.type}`,
    );

    try {
      // All critical operations within a single transaction
      await this.knex.transaction(async (trx) => {
        switch (dto.type) {
          case 'payment_intent.succeeded':
            await this.handlePaymentSucceeded(dto, trx);
            break;

          case 'payment_intent.payment_failed':
            await this.handlePaymentFailed(dto, trx);
            break;

          case 'charge.refunded':
            await this.handleChargeRefunded(dto, trx);
            break;

          default:
            this.logger.warn(`Unhandled webhook type: ${dto.type}`);
        }

        // Mark webhook as processed
        await trx('webhook_events')
          .where({ external_id: webhookEventId })
          .update({ processed_at: new Date() });
      });

      this.logger.log(`Webhook ${webhookEventId} processed successfully`);
    } catch (error) {
      this.logger.error(
        `Failed to process webhook ${webhookEventId}: ${error.message}`,
        error.stack,
      );
      throw error; // Bull will retry based on backoff config
    }
  }

  private async handlePaymentSucceeded(
    dto: StripeWebhookDto,
    trx: Knex.Transaction,
  ): Promise<void> {
    const paymentId = dto.data.object.metadata?.payment_id;
    if (!paymentId) {
      throw new Error('payment_id not found in metadata');
    }

    // Update payment status
    await this.paymentRepository.updateStatus(
      paymentId,
      PaymentStatus.COMPLETED,
      trx,
    );

    // TODO: Update account balance (need AccountsRepository with transaction support)
    // TODO: Create transaction record
    // TODO: Emit event for notifications

    this.logger.log(`Payment ${paymentId} marked as completed`);
  }

  private async handlePaymentFailed(
    dto: StripeWebhookDto,
    trx: Knex.Transaction,
  ): Promise<void> {
    const paymentId = dto.data.object.metadata?.payment_id;
    if (!paymentId) {
      throw new Error('payment_id not found in metadata');
    }

    await this.paymentRepository.updateStatus(paymentId, PaymentStatus.FAILED, trx);

    this.logger.log(`Payment ${paymentId} marked as failed`);
  }

  private async handleChargeRefunded(
    dto: StripeWebhookDto,
    trx: Knex.Transaction,
  ): Promise<void> {
    // TODO: Implement refund logic
    this.logger.log('Refund webhook received - not yet implemented');
  }
}
