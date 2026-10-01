import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { PartnerCallsService } from '../../../gatehouse/partner-calls.service';
import type { InvoiceReviewState } from '../invoice-review.state';
import { VENDOR_REGISTRY_AGENT, createVendorNode, parseVendorAnswer, vendorExceptions } from '../nodes/vendor.node';

const answer = (data: Record<string, unknown>) => [{ data }];

describe('the vendor check', () => {
  it('reads the registry answer, and refuses one without a known status', () => {
    expect(parseVendorAnswer('Registry', answer({ vendor: 'ACME', status: 'approved', bankDetailsChangedOn: null, note: 'ok' }))).toEqual({
      result: 'checked', partner: 'Registry', status: 'approved', bankDetailsChangedOn: null, note: 'ok',
    });
    expect(() => parseVendorAnswer('Registry', [{ text: 'approved' }])).toThrow('without a vendor status');
    expect(() => parseVendorAnswer('Registry', answer({ status: 'fine' }))).toThrow('unknown vendor status fine');
  });

  it('raises an exception for a vendor on hold or unknown, a bank change, or no answer', () => {
    const checked = { result: 'checked' as const, partner: 'Registry', note: 'n' };
    expect(vendorExceptions(null)).toEqual([]);
    expect(vendorExceptions({ ...checked, status: 'approved', bankDetailsChangedOn: null })).toEqual([]);
    expect(vendorExceptions({ ...checked, status: 'on_hold', bankDetailsChangedOn: null }).map((e) => [e.code, e.severity, e.detail])).toEqual([
      ['vendor_standing', 'high', 'Registry: the vendor is on hold. n'],
    ]);
    expect(vendorExceptions({ ...checked, status: 'unknown', bankDetailsChangedOn: '2026-09-24' }).map((e) => e.code)).toEqual(['vendor_standing', 'vendor_bank_change']);
    expect(vendorExceptions({ result: 'unverified', error: 'HTTP 502' })[0]).toMatchObject({ code: 'vendor_standing', detail: 'The vendor registry could not be asked: HTTP 502' });
  });

  describe('the vendor step', () => {
    const context = createMockExecutionContext({ orgSlug: 'finance', agentSlug: 'invoice-review' });
    const state = { executionContext: context, invoice: { vendor: 'Cascade Cloud Services, Inc.' } } as unknown as InvoiceReviewState;
    const partners = { available: jest.fn(), ask: jest.fn() };
    const step = createVendorNode({ partners: partners as unknown as PartnerCallsService });
    const reportProgress = jest.fn(async () => undefined);
    const config = { configurable: { reportProgress } };

    beforeEach(() => jest.clearAllMocks());

    it('asks the partner through the org\'s vendor-registry agent with the run\'s own context', async () => {
      partners.available.mockResolvedValue(true);
      partners.ask.mockResolvedValue({ partner: 'Registry', parts: answer({ status: 'approved', bankDetailsChangedOn: '2026-09-24', note: 'call first' }) });
      expect(await step(state, config)).toEqual({
        vendorCheck: { result: 'checked', partner: 'Registry', status: 'approved', bankDetailsChangedOn: '2026-09-24', note: 'call first' },
      });
      expect(partners.ask).toHaveBeenCalledWith(context, VENDOR_REGISTRY_AGENT, [{ data: { vendor: 'Cascade Cloud Services, Inc.' } }]);
      expect(reportProgress).toHaveBeenCalledWith(expect.objectContaining({ step: 'vendor', message: 'Asking the partner vendor registry about Cascade Cloud Services, Inc.' }));
    });

    it('has no check in an org without the agent, and an unverified one when the partner fails', async () => {
      partners.available.mockResolvedValue(false);
      expect(await step(state, config)).toEqual({ vendorCheck: null });
      expect(partners.ask).not.toHaveBeenCalled();
      expect(reportProgress).toHaveBeenCalledWith(expect.objectContaining({ step: 'vendor', message: 'No partner vendor registry is set up for this organization' }));

      partners.available.mockResolvedValue(true);
      partners.ask.mockRejectedValue(new Error('Partner Vendor Registry returned HTTP 502'));
      expect(await step(state, config)).toEqual({ vendorCheck: { result: 'unverified', error: 'Partner Vendor Registry returned HTTP 502' } });
    });
  });
});
