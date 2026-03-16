import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PaymentService, PaymentVerifyRequest, PaymentVerifyResult } from './payment.service';
import { PersistedPaymentReceipt } from '@agent-communication/shared-protocols';

@Controller('api/payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * GET /api/payment/receipts
   * Returns all persisted payment receipts across all providers.
   */
  @Get('receipts')
  getAllReceipts(): PersistedPaymentReceipt[] {
    return this.paymentService.getAllReceipts();
  }

  /**
   * GET /api/payment/receipts/:id
   * Returns a single payment receipt by its record ID (invoiceId).
   */
  @Get('receipts/:id')
  getReceipt(@Param('id') id: string): PersistedPaymentReceipt {
    return this.paymentService.getReceipt(id);
  }

  /**
   * POST /api/payment/verify
   * Reconciles a stored payment record against the live provider.
   *
   * Body: { paymentRecordId: string, provider: 'lightning-l402' | 'stripe-fiat' | 'x402-usdc' }
   *
   * Returns the reconciliation result including whether the stored status
   * matches the live provider status.
   *
   * Throws 404 if the record is not found.
   * Throws 500 if the provider is not configured (explicit error, no fallback).
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyPayment(@Body() body: PaymentVerifyRequest): Promise<PaymentVerifyResult> {
    return this.paymentService.verifyPayment(body);
  }
}
