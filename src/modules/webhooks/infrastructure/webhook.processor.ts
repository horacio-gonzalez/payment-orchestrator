import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger, Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { PaymentRepository } from '../../payments/infrastructure/payment.repository';
import { PaymentStatus } from '../../payments/domain/payment.types';
import { AccountsService } from '../../accounts/domain/accounts.service';
import { TransactionsService } from '../../transactions/domain/transactions.service';
import { IWebhookEventsRepository } from '../domain/i-webhook-events.repository';
import { WebhookEventStatus } from '../domain/webhook-event.types';
import { StripeWebhookDto } from '../domain/dto';

@Injectable()
@Processor('webhook-processing')
export class WebhookProcessor {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    @Inject('KNEX') private readonly knex: Knex,
    private readonly paymentRepository: PaymentRepository,
    private readonly accountsService: AccountsService,
    private readonly transactionsService: TransactionsService,
    private readonly webhookEventsRepository: IWebhookEventsRepository,
  ) { }

  @Process('process-payment-webhook')
  async processPaymentWebhook(job: Job): Promise<void> {
    const { webhookEventId, payload } = job.data;
    const dto = payload as StripeWebhookDto;

    this.logger.log(
      `Processing webhook job ${job.id} for event ${webhookEventId}, type: ${dto.type}`,
    );

    try {
      await this.knex.transaction(async (trx) => {
        // Mark webhook as processing
        await this.webhookEventsRepository.updateStatus(
          webhookEventId,
          WebhookEventStatus.PROCESSING,
          trx,
        );

        switch (dto.type) {
          case 'payment_intent.succeeded':
            await this.handlePaymentSucceeded(dto, webhookEventId, trx);
            break;

          case 'payment_intent.payment_failed':
            await this.handlePaymentFailed(dto, webhookEventId, trx);
            break;

          case 'charge.refunded':
            await this.handleChargeRefunded(dto, webhookEventId, trx);
            break;

          default:
            this.logger.warn(`Unhandled webhook type: ${dto.type}`);
        }

        // Mark webhook as processed
        await this.webhookEventsRepository.updateStatus(
          webhookEventId,
          WebhookEventStatus.PROCESSED,
          trx,
        );
      });

      this.logger.log(`Webhook ${webhookEventId} processed successfully`);
    } catch (error) {
      this.logger.error(
        `Failed to process webhook ${webhookEventId}: ${error.message}`,
        error.stack,
      );

      // Mark as failed (outside transaction since the trx rolled back)
      try {
        await this.webhookEventsRepository.updateStatus(
          webhookEventId,
          WebhookEventStatus.FAILED,
        );
        await this.webhookEventsRepository.updateError(
          webhookEventId,
          error.message,
        );
        await this.webhookEventsRepository.incrementRetryCount(webhookEventId);
      } catch (updateErr) {
        this.logger.error(`Failed to update webhook error status: ${updateErr.message}`);
      }

      throw error; // Bull will retry based on backoff config
    }
  }

  private async handlePaymentSucceeded(
    dto: StripeWebhookDto,
    webhookEventId: string,
    trx: Knex.Transaction,
  ): Promise<void> {
    const paymentId = dto.data.object.metadata?.payment_id;
    if (!paymentId) {
      throw new Error('payment_id not found in webhook metadata');
    }

    // Lock and get payment
    const payment = await this.paymentRepository.findByIdForUpdate(paymentId, trx);
    if (!payment) {
      throw new Error(`Payment ${paymentId} not found`);
    }

    // Update payment status
    await this.paymentRepository.updateStatus(paymentId, PaymentStatus.SUCCEEDED, trx);

    // Credit account balance
    await this.accountsService.creditFunds(payment.accountId, payment.amount, trx);

    // Record transaction in audit log
    await this.transactionsService.recordCredit(
      payment.accountId,
      payment.amount,
      paymentId,
      'payment',
      trx,
      `Payment ${paymentId} succeeded`,
    );

    // Associate webhook with payment
    await this.webhookEventsRepository.updatePaymentAssociation(
      webhookEventId,
      paymentId,
      trx,
    );

    this.logger.log(`Payment ${paymentId} succeeded: balance credited ${payment.amount}`);
  }

  private async handlePaymentFailed(
    dto: StripeWebhookDto,
    webhookEventId: string,
    trx: Knex.Transaction,
  ): Promise<void> {
    const paymentId = dto.data.object.metadata?.payment_id;
    if (!paymentId) {
      throw new Error('payment_id not found in webhook metadata');
    }

    const payment = await this.paymentRepository.findByIdForUpdate(paymentId, trx);
    if (!payment) {
      throw new Error(`Payment ${paymentId} not found`);
    }

    // Update payment status
    await this.paymentRepository.updateStatus(paymentId, PaymentStatus.FAILED, trx);

    // Associate webhook with payment
    await this.webhookEventsRepository.updatePaymentAssociation(
      webhookEventId,
      paymentId,
      trx,
    );

    this.logger.log(`Payment ${paymentId} marked as failed`);
  }

  private async handleChargeRefunded(
    dto: StripeWebhookDto,
    webhookEventId: string,
    trx: Knex.Transaction,
  ): Promise<void> {
    const paymentId = dto.data.object.metadata?.payment_id;
    if (!paymentId) {
      throw new Error('payment_id not found in webhook metadata');
    }

    const payment = await this.paymentRepository.findByIdForUpdate(paymentId, trx);
    if (!payment) {
      throw new Error(`Payment ${paymentId} not found`);
    }

    const amountRefunded = dto.data.object.amount_refunded
      ? dto.data.object.amount_refunded / 100 // Stripe amounts in cents
      : payment.amount;

    // Update payment status
    await this.paymentRepository.updateStatus(paymentId, PaymentStatus.REFUNDED, trx);

    // Credit refunded amount back to account
    await this.accountsService.creditFunds(payment.accountId, amountRefunded, trx);

    // Record refund transaction
    await this.transactionsService.recordCredit(
      payment.accountId,
      amountRefunded,
      paymentId,
      'refund',
      trx,
      `Refund for payment ${paymentId}`,
    );

    // Associate webhook with payment
    await this.webhookEventsRepository.updatePaymentAssociation(
      webhookEventId,
      paymentId,
      trx,
    );

    this.logger.log(`Payment ${paymentId} refunded: ${amountRefunded} credited back`);
  }
}
