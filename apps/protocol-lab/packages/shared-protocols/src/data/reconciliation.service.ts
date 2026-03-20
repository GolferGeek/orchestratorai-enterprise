import { DataLoaderService } from './data-loader.service';
import { TransactionRecord, SourceDataReference } from './types';

export interface ReconciliationDetail {
  transactionId: string;
  sourceData: SourceDataReference;
  status: 'matched' | 'mismatched' | 'missing';
  message: string;
}

export interface ReconciliationReport {
  company: string;
  reconciledAt: string;
  consistent: boolean;
  total: number;
  matched: number;
  mismatched: number;
  missing: number;
  details: ReconciliationDetail[];
}

export class ReconciliationService {
  constructor(private readonly dataLoader: DataLoaderService) {}

  /**
   * Reconcile all transactions for a company against the referenced source data files.
   *
   * For each transaction that carries a sourceData reference, verify the referenced
   * record exists in the appropriate data file. Returns a report describing the
   * outcome of every checked transaction.
   */
  reconcile(company: string): ReconciliationReport {
    const transactions = this.loadTransactions(company);
    const details: ReconciliationDetail[] = [];

    let matched = 0;
    let mismatched = 0;
    let missing = 0;

    for (const txn of transactions) {
      if (!txn.sourceData) {
        // No source reference — nothing to reconcile for this transaction.
        continue;
      }

      const ref = txn.sourceData;
      const detail = this.checkReference(txn.id, ref);
      details.push(detail);

      switch (detail.status) {
        case 'matched':   matched++;   break;
        case 'mismatched': mismatched++; break;
        case 'missing':   missing++;   break;
      }
    }

    const total = matched + mismatched + missing;
    return {
      company,
      reconciledAt: new Date().toISOString(),
      consistent: mismatched === 0 && missing === 0,
      total,
      matched,
      mismatched,
      missing,
      details,
    };
  }

  /**
   * Load transactions for a company. Throws if the file does not exist.
   */
  private loadTransactions(company: string): TransactionRecord[] {
    const dataFile = this.dataLoader.loadFile<TransactionRecord>(company, 'transactions');
    return dataFile.records;
  }

  /**
   * Check whether the record referenced by a SourceDataReference exists in the
   * data loader. The `file` field uses the path format `<orgId>/<filename>`.
   */
  private checkReference(
    transactionId: string,
    ref: SourceDataReference,
  ): ReconciliationDetail {
    const [orgId, filename] = ref.file.split('/');

    if (!orgId || !filename) {
      return {
        transactionId,
        sourceData: ref,
        status: 'mismatched',
        message: `sourceData.file has unexpected format "${ref.file}" — expected "orgId/filename"`,
      };
    }

    let record: unknown;
    try {
      record = this.dataLoader.getById(orgId, filename, ref.recordId);
    } catch (err) {
      return {
        transactionId,
        sourceData: ref,
        status: 'missing',
        message: `Data file "${ref.file}" could not be loaded: ${(err as Error).message}`,
      };
    }

    if (!record) {
      return {
        transactionId,
        sourceData: ref,
        status: 'missing',
        message: `Record "${ref.recordId}" not found in "${ref.file}"`,
      };
    }

    return {
      transactionId,
      sourceData: ref,
      status: 'matched',
      message: `Record "${ref.recordId}" found in "${ref.file}" (${ref.recordType})`,
    };
  }
}
