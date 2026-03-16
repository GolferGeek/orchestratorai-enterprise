import { CommerceCheckoutPaymentProvider } from '../commerce-checkout.provider';
import * as crypto from 'crypto';

describe('CommerceCheckoutPaymentProvider', () => {
  let provider: CommerceCheckoutPaymentProvider;

  beforeEach(() => {
    provider = new CommerceCheckoutPaymentProvider();
  });

  it('creates checkout gate and settles to verified receipt', async () => {
    const gate = await provider.createPaymentGate(1350, ['product:report', 'product:score']);
    const receipt = await provider.requestPayment({
      invoiceId: 'inv-1',
      gateId: gate.gateId,
      amount: 1350,
      currency: 'USD',
      payTo: 'merchant',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    expect(receipt.status).toBe('pending');
    expect(receipt.transactionHash).toContain('checkout_tx_');

    const settled = await provider.settleTransaction(receipt.transactionHash!);
    expect(settled.status).toBe('verified');
    expect(await provider.verifyPayment(settled)).toBe(true);
  });

  it('validates webhook HMAC signatures', () => {
    const payload = '{"checkout":"ok"}';
    const secret = 'whsec_test';
    const goodSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    expect(provider.verifyWebhookSignature(payload, goodSig, secret)).toBe(true);
    expect(provider.verifyWebhookSignature(payload, 'bad', secret)).toBe(false);
  });
});
