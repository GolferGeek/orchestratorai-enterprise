import { join } from 'path';
import { DataLoaderService } from '../data/data-loader.service';
import { DataRecord } from '../data/types';
import { PaymentGate, PaymentReceipt } from './payment.interface';

const GATES_FILE = 'payment-gates';
const RECEIPTS_FILE = 'payment-receipts';
/** DataLoaderService uses orgId as a subdirectory — empty string keeps files flat. */
const ORG_ID = '';

export interface PersistedPaymentGate extends PaymentGate, DataRecord {
  id: string;
  providerId: string;
  createdAt: string;
}

export interface PersistedPaymentReceipt extends DataRecord {
  id: string;
  providerId: string;
  invoiceId: string;
  transactionHash: string | undefined;
  paidAt: string;
  amount: number;
  currency: string;
  status: 'verified' | 'pending' | 'failed';
  updatedAt: string;
}

/**
 * Persists payment gates and receipts to JSON files in protocol-api/data/.
 * Uses DataLoaderService for file operations.
 *
 * Pass an instance of this service to any payment provider to enable persistence.
 */
export class PaymentPersistenceService {
  private readonly dataLoader: DataLoaderService;

  constructor(dataDir?: string) {
    const baseDir = dataDir
      ?? process.env.PROTOCOL_API_DATA_DIR
      ?? join(process.cwd(), 'data');

    this.dataLoader = new DataLoaderService({ baseDir });
    this.dataLoader.ensureFile(ORG_ID, GATES_FILE);
    this.dataLoader.ensureFile(ORG_ID, RECEIPTS_FILE);
  }

  // ---------------------------------------------------------------------------
  // Gates
  // ---------------------------------------------------------------------------

  persistGate(providerId: string, gate: PaymentGate): void {
    const record: PersistedPaymentGate = {
      id: gate.gateId,
      providerId,
      gateId: gate.gateId,
      capabilities: gate.capabilities,
      price: gate.price,
      currency: gate.currency,
      createdAt: new Date().toISOString(),
    };
    this.dataLoader.appendRecord<PersistedPaymentGate>(ORG_ID, GATES_FILE, record);
  }

  loadGates(): PersistedPaymentGate[] {
    const file = this.dataLoader.loadFile<PersistedPaymentGate>(ORG_ID, GATES_FILE);
    return file.records;
  }

  // ---------------------------------------------------------------------------
  // Receipts
  // ---------------------------------------------------------------------------

  persistReceipt(providerId: string, receipt: PaymentReceipt): void {
    const existing = this.dataLoader.getById<PersistedPaymentReceipt>(ORG_ID, RECEIPTS_FILE, receipt.invoiceId);
    if (existing) {
      this.dataLoader.updateRecord<PersistedPaymentReceipt>(ORG_ID, RECEIPTS_FILE, receipt.invoiceId, {
        status: receipt.status,
        updatedAt: new Date().toISOString(),
      });
    } else {
      const record: PersistedPaymentReceipt = {
        id: receipt.invoiceId,
        providerId,
        invoiceId: receipt.invoiceId,
        transactionHash: receipt.transactionHash,
        paidAt: receipt.paidAt,
        amount: receipt.amount,
        currency: receipt.currency,
        status: receipt.status,
        updatedAt: new Date().toISOString(),
      };
      this.dataLoader.appendRecord<PersistedPaymentReceipt>(ORG_ID, RECEIPTS_FILE, record);
    }
  }

  loadReceipts(): PersistedPaymentReceipt[] {
    const file = this.dataLoader.loadFile<PersistedPaymentReceipt>(ORG_ID, RECEIPTS_FILE);
    return file.records;
  }
}
