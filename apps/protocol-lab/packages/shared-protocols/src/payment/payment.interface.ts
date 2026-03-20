export interface PaymentGate {
  gateId: string;
  capabilities: string[];
  price: number;
  currency: string;
}

export interface PaymentInvoice {
  invoiceId: string;
  gateId: string;
  amount: number;
  currency: string;
  payTo: string;
  expiresAt: string;
}

export interface PaymentReceipt {
  invoiceId: string;
  transactionHash?: string;
  paidAt: string;
  amount: number;
  currency: string;
  status: 'verified' | 'pending' | 'failed';
}

export interface IPaymentProvider {
  readonly providerId: string;

  createPaymentGate(price: number, capabilities: string[]): Promise<PaymentGate>;
  requestPayment(invoice: PaymentInvoice): Promise<PaymentReceipt>;
  verifyPayment(receipt: PaymentReceipt): Promise<boolean>;
  settleTransaction(transactionHash: string): Promise<PaymentReceipt>;
}
