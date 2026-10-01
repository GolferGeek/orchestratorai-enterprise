import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { PartnerCallsService } from '../../../gatehouse/partner-calls.service';
import type { A2APart } from '../../../gatehouse/a2a-v1';
import { reportProgress } from '../../shared/runs';
import type { InvoiceReviewState, VendorCheck } from '../invoice-review.state';
import type { MatchException } from '../three-way-match';

/** The org's A2A agent that forwards to the partner's vendor registry. */
export const VENDOR_REGISTRY_AGENT = 'vendor-registry';

const STANDINGS = new Set(['approved', 'on_hold', 'unknown']);

/** The registry's answer: a data part {vendor, status, bankDetailsChangedOn, note}. */
export function parseVendorAnswer(partner: string, parts: A2APart[]): VendorCheck {
  const data = parts.find((part): part is { data: Record<string, unknown> } => 'data' in part)?.data;
  if (!data) throw new Error(`${partner} answered without a vendor status`);
  const { status, bankDetailsChangedOn, note } = data;
  if (typeof status !== 'string' || !STANDINGS.has(status)) throw new Error(`${partner} answered an unknown vendor status ${String(status)}`);
  if (bankDetailsChangedOn !== null && typeof bankDetailsChangedOn !== 'string') throw new Error(`${partner} answered a bank change date that is not a date`);
  return {
    result: 'checked',
    partner,
    status: status as 'approved' | 'on_hold' | 'unknown',
    bankDetailsChangedOn: bankDetailsChangedOn ?? null,
    note: typeof note === 'string' ? note : '',
  };
}

/** What the vendor check means for the invoice: a person looks at anything but a clean answer. */
export function vendorExceptions(check: VendorCheck | null): MatchException[] {
  if (check === null) return [];
  if (check.result === 'unverified') {
    return [{ key: 'vendor_standing', code: 'vendor_standing', severity: 'high', detail: `The vendor registry could not be asked: ${check.error}`, invoiceLine: null }];
  }
  const found: MatchException[] = [];
  if (check.status !== 'approved') {
    const standing = check.status === 'on_hold' ? 'on hold' : 'not in the registry';
    found.push({ key: 'vendor_standing', code: 'vendor_standing', severity: 'high', detail: `${check.partner}: the vendor is ${standing}. ${check.note}`.trim(), invoiceLine: null });
  }
  if (check.bankDetailsChangedOn) {
    found.push({
      key: 'vendor_bank_change',
      code: 'vendor_bank_change',
      severity: 'high',
      detail: `${check.partner}: the vendor's bank details changed on ${check.bankDetailsChangedOn}. ${check.note}`.trim(),
      invoiceLine: null,
    });
  }
  return found;
}

/**
 * Ask the partner's vendor registry (over A2A, through the org's
 * vendor-registry agent) about the invoice's vendor. An org without that
 * agent has no vendor check. If the partner cannot be asked, the invoice is
 * unverified and goes to a person with the reason.
 */
export function createVendorNode(deps: { partners: PartnerCallsService }) {
  return async (state: InvoiceReviewState, config: LangGraphRunnableConfig): Promise<Partial<InvoiceReviewState>> => {
    const context = state.executionContext;
    const vendor = state.invoice!.vendor;
    if (!(await deps.partners.available(context, VENDOR_REGISTRY_AGENT))) {
      await reportProgress(config, 'vendor', 45, 'No partner vendor registry is set up for this organization');
      return { vendorCheck: null };
    }
    await reportProgress(config, 'vendor', 45, `Asking the partner vendor registry about ${vendor}`);
    let check: VendorCheck;
    try {
      const answer = await deps.partners.ask(context, VENDOR_REGISTRY_AGENT, [{ data: { vendor } }]);
      check = parseVendorAnswer(answer.partner, answer.parts);
    } catch (error) {
      check = { result: 'unverified', error: error instanceof Error ? error.message : String(error) };
    }
    return { vendorCheck: check };
  };
}
