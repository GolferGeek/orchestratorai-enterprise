export interface DataRecord {
  id: string;
  [key: string]: unknown;
}

export interface DataFile<T extends DataRecord = DataRecord> {
  filename: string;
  orgId: string;
  records: T[];
  loadedAt: string;
}

export type DataFilter = (record: DataRecord) => boolean;

export interface DataLoaderOptions {
  /** Base directory for data files (app's data/ directory) */
  baseDir: string;
  /** Watch for file changes and auto-reload (dev mode) */
  watch?: boolean;
}

export interface SourceDataReference {
  /** Relative path within the app's data dir, e.g. "apex-oem/purchase-orders" */
  file: string;
  /** The id field of the record in that file */
  recordId: string;
  /** Human-readable type name, e.g. "PurchaseOrder", "LoanApplication" */
  recordType: string;
}

export interface TransactionRecord extends DataRecord {
  /** Format: txn-{uuid} */
  id: string;
  /** Links to ProtocolMessage.id in protocol-api messages.json */
  messageId: string;
  /** ISO 8601 */
  timestamp: string;
  /** Business transaction type */
  type: 'purchase-order' | 'loan-application' | 'quality-hold' | 'bid-deposit' | 'spec-query' | 'compliance-review' | 'onboarding' | 'rate-inquiry' | 'collateral-update' | 'examination';
  /** Agent/company that initiated */
  sourceAgent: string;
  /** Agent/company that received */
  targetAgent: string;
  /** A2A method (po.submit, quality.holdAlert, etc.) */
  method: string;
  /** Financial amount if applicable */
  amount: number | null;
  /** USD, BTC-SAT, USDC */
  currency: string | null;
  /** lightning-l402, stripe-fiat, x402-usdc, mock */
  paymentProvider: string | null;
  /** pending, settled, failed, free */
  paymentStatus: string | null;
  /** Payment transaction hash */
  transactionHash: string | null;
  /** Overall status */
  status: 'success' | 'error' | 'pending';
  /** Link to the business record this transaction references */
  sourceData: SourceDataReference | null;
  /** Human-readable one-liner */
  summary: string;
}
