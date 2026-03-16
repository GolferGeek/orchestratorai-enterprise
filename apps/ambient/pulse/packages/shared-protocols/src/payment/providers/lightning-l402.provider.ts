import * as crypto from 'crypto';
import * as https from 'https';
import { IPaymentProvider, PaymentGate, PaymentInvoice, PaymentReceipt } from '../payment.interface';
import { PaymentPersistenceService } from '../payment-persistence.service';

/**
 * L402 (formerly LSAT) payment provider using a real LND REST API.
 * Issues macaroon-style tokens backed by Lightning invoices and verifies
 * payment settlement via the LND node before granting API access.
 *
 * Required env vars:
 *   LIGHTNING_LND_REST_URL  - e.g. https://localhost:8080 or Voltage URL
 *   LIGHTNING_LND_MACAROON  - hex-encoded admin macaroon
 * Optional:
 *   LIGHTNING_LND_TLS_CERT  - base64-encoded TLS cert (for self-signed / local nodes)
 *   LIGHTNING_NETWORK        - mainnet | testnet (default: testnet)
 */
export class LightningL402PaymentProvider implements IPaymentProvider {
  readonly providerId = 'lightning-l402';

  private readonly lndRestUrl: string;
  private readonly macaroonHex: string;
  private readonly tlsAgent: https.Agent | undefined;

  private gates: Map<string, PaymentGate> = new Map();
  private receipts: Map<string, PaymentReceipt> = new Map();
  /** Maps macaroon token -> base64url-encoded r_hash for LND lookups */
  private macaroonToRHash: Map<string, string> = new Map();
  private readonly persistence: PaymentPersistenceService | null;

  constructor(persistence?: PaymentPersistenceService) {
    this.persistence = persistence ?? null;
    const restUrl = process.env.LIGHTNING_LND_REST_URL;
    const macaroon = process.env.LIGHTNING_LND_MACAROON;

    if (!restUrl) {
      throw new Error('LIGHTNING_LND_REST_URL environment variable is not set');
    }
    if (!macaroon) {
      throw new Error('LIGHTNING_LND_MACAROON environment variable is not set');
    }

    // Strip trailing slash for consistency
    this.lndRestUrl = restUrl.replace(/\/+$/, '');
    this.macaroonHex = macaroon;

    // If a TLS cert is provided (local/self-signed nodes), create a custom agent
    const tlsCert = process.env.LIGHTNING_LND_TLS_CERT;
    const skipVerify = process.env.LIGHTNING_LND_TLS_SKIP_VERIFY === 'true';
    if (tlsCert) {
      const certBuffer = Buffer.from(tlsCert, 'base64');
      this.tlsAgent = new https.Agent({ ca: certBuffer, rejectUnauthorized: true });
    } else if (skipVerify) {
      // For regtest/local Docker nodes with self-signed certs
      this.tlsAgent = new https.Agent({ rejectUnauthorized: false });
    }
  }

  // ---------------------------------------------------------------------------
  // LND REST helper
  // ---------------------------------------------------------------------------

  private async lndRequest<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.lndRestUrl}${path}`;

    const headers: Record<string, string> = {
      'Grpc-Metadata-macaroon': this.macaroonHex,
      'Content-Type': 'application/json',
    };

    const fetchOptions: RequestInit & { agent?: https.Agent } = {
      method,
      headers,
    };

    if (body !== undefined) {
      fetchOptions.body = JSON.stringify(body);
    }

    // Use the custom TLS agent when available (Node 18+ fetch supports dispatcher,
    // but for broad compat we fall back to the https module when a custom cert is needed).
    if (this.tlsAgent) {
      return this.lndRequestHttps<T>(method, url, headers, body);
    }

    const response = await fetch(url, fetchOptions as RequestInit);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LND API error ${response.status} ${method} ${path}: ${text}`);
    }

    return (await response.json()) as T;
  }

  /**
   * Fallback for environments where a custom TLS cert is needed.
   * Uses the built-in Node.js `https` module directly.
   */
  private lndRequestHttps<T>(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: unknown,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const parsed = new URL(url);

      const options: https.RequestOptions = {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method,
        headers,
        agent: this.tlsAgent,
      };

      const req = https.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            reject(new Error(`LND API error ${res.statusCode} ${method} ${parsed.pathname}: ${raw}`));
            return;
          }
          try {
            resolve(JSON.parse(raw) as T);
          } catch {
            reject(new Error(`LND API returned non-JSON response: ${raw}`));
          }
        });
      });

      req.on('error', reject);

      if (body !== undefined) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  // ---------------------------------------------------------------------------
  // IPaymentProvider implementation
  // ---------------------------------------------------------------------------

  async createPaymentGate(price: number, capabilities: string[]): Promise<PaymentGate> {
    const gate: PaymentGate = {
      gateId: crypto.randomUUID(),
      capabilities,
      price,
      currency: 'BTC-SAT',
    };
    this.gates.set(gate.gateId, gate);
    this.persistence?.persistGate(this.providerId, gate);
    return gate;
  }

  async requestPayment(invoice: PaymentInvoice): Promise<PaymentReceipt> {
    const gate = this.gates.get(invoice.gateId);

    // Create a real Lightning invoice via LND
    interface AddInvoiceResponse {
      r_hash: string; // base64-encoded payment hash
      payment_request: string; // BOLT11 invoice string
    }

    const lndResponse = await this.lndRequest<AddInvoiceResponse>('POST', '/v1/invoices', {
      value: invoice.amount.toString(),
      memo: `L402 payment for ${invoice.gateId}`,
      expiry: '3600',
    });

    const rHashBase64 = lndResponse.r_hash;

    // Build a macaroon-style L402 token
    const macaroonPayload = {
      identifier: rHashBase64,
      location: 'agent-comm',
      version: 0,
      caveats: [{ capabilities: gate ? gate.capabilities : [] }],
    };
    const macaroonToken = Buffer.from(JSON.stringify(macaroonPayload)).toString('base64');

    // Convert the base64 r_hash to hex for LND GET /v1/invoice/{r_hash_str} lookups
    const rHashHex = Buffer.from(rHashBase64, 'base64').toString('hex');

    // Store mappings
    this.macaroonToRHash.set(macaroonToken, rHashHex);

    const receipt: PaymentReceipt = {
      invoiceId: invoice.invoiceId,
      transactionHash: macaroonToken,
      paidAt: new Date().toISOString(),
      amount: invoice.amount,
      currency: 'BTC-SAT',
      status: 'pending',
    };
    this.receipts.set(macaroonToken, receipt);
    this.persistence?.persistReceipt(this.providerId, receipt);

    return receipt;
  }

  async verifyPayment(receipt: PaymentReceipt): Promise<boolean> {
    if (!receipt.transactionHash) {
      return false;
    }

    const rHashHex = this.macaroonToRHash.get(receipt.transactionHash);
    if (!rHashHex) {
      return false;
    }

    // Look up the invoice on LND to check settlement status
    interface LookupInvoiceResponse {
      settled: boolean;
      state: string; // OPEN, SETTLED, CANCELED, ACCEPTED
    }

    const lndInvoice = await this.lndRequest<LookupInvoiceResponse>(
      'GET',
      `/v1/invoice/${rHashHex}`,
    );

    const stored = this.receipts.get(receipt.transactionHash);
    if (stored) {
      stored.status = lndInvoice.settled ? 'verified' : 'pending';
      this.receipts.set(receipt.transactionHash, stored);
      this.persistence?.persistReceipt(this.providerId, stored);
    }

    return lndInvoice.settled;
  }

  async settleTransaction(transactionHash: string): Promise<PaymentReceipt> {
    const rHashHex = this.macaroonToRHash.get(transactionHash);

    if (rHashHex) {
      interface LookupInvoiceResponse {
        settled: boolean;
        state: string;
        value: string;
      }

      const lndInvoice = await this.lndRequest<LookupInvoiceResponse>(
        'GET',
        `/v1/invoice/${rHashHex}`,
      );

      const stored = this.receipts.get(transactionHash);
      if (stored) {
        stored.status = lndInvoice.settled ? 'verified' : 'pending';
        this.persistence?.persistReceipt(this.providerId, stored);
        return stored;
      }

      return {
        invoiceId: crypto.randomUUID(),
        transactionHash,
        paidAt: new Date().toISOString(),
        amount: parseInt(lndInvoice.value, 10) || 0,
        currency: 'BTC-SAT',
        status: lndInvoice.settled ? 'verified' : 'pending',
      };
    }

    // No mapping found — cannot look up on LND
    throw new Error(`No LND invoice mapping found for transaction hash: ${transactionHash}`);
  }
}
