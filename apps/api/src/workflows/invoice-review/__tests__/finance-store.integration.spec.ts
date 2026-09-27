/**
 * Finance's store against the real tables and the seeded purchase orders.
 * Set WORKFLOW_RUNS_TEST_DATABASE_URL to run it. The run and its decision are
 * removed through the conversation.
 */
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { createExecutionContext } from '@orchestrator-ai/transport-types';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import { WorkflowRunsRepository } from '../../shared/runs';
import { FinanceStoreService } from '../finance-store.service';

const url = process.env.WORKFLOW_RUNS_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

describeWithDb('finance store against Postgres', () => {
  const runId: string = randomUUID();
  let db: PostgresqlDatabaseService;
  let store: FinanceStoreService;
  const sql = async (text: string, params: unknown[] = []) => {
    const { data, error } = await db.rawQuery(text, params);
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>[];
  };

  beforeAll(async () => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    store = new FinanceStoreService(db);
    const userId = String((await sql(`SELECT id FROM auth.users WHERE email = 'demo-user@orchestratorai.io'`))[0]?.id);
    await sql(
      `INSERT INTO public.conversations (id, user_id, agent_name, agent_type, organization_slug, started_at, created_at, updated_at)
       VALUES ($1, $2, 'invoice-review', 'workflow', 'finance', now(), now(), now())`,
      [runId, userId],
    );
    await new WorkflowRunsRepository(db).insertQueued({
      context: createExecutionContext({ orgSlug: 'finance', userId, conversationId: runId, agentSlug: 'invoice-review', agentType: 'workflow', provider: 'openrouter', model: 'm' }),
      input: { poNumber: 'PO-4502' },
      documents: [],
      modelProfile: {},
      accessControl: { mode: 'org' },
      maxAttempts: 1,
    });
  });

  afterAll(async () => {
    await sql(`DELETE FROM public.conversations WHERE id = $1`, [runId]);
  });

  it('loads a PO with what was received on each line, and only in its org', async () => {
    const po = await store.purchaseOrder('finance', 'PO-4502');
    expect(po?.lines.map((l) => [l.lineNo, l.quantity, l.unitPrice, l.received])).toEqual([[1, 12, 389, 12], [2, 12, 649, 8]]);
    expect(await store.purchaseOrder('marketing', 'PO-4502')).toBeNull();
    expect((await store.purchaseOrders('finance')).map((p) => p.poNumber)).toEqual(['PO-4471', 'PO-4502', 'PO-4519']);
  });

  it('knows an invoice already paid, whatever the vendor name suffix', async () => {
    const paid = { vendor: 'ACME Industrial Supply', invoiceNumber: 'INV-20931', invoiceDate: null, terms: null, currency: 'USD', lines: [], total: 608 };
    expect(await store.isDuplicate('finance', paid, runId)).toBe(true);
    expect(await store.isDuplicate('finance', { ...paid, invoiceNumber: 'INV-99999' }, runId)).toBe(false);
  });

  it('records the decision once, and refuses a different second decision', async () => {
    const invoice = { vendor: 'Summit Office Interiors, L.L.C.', invoiceNumber: `SOI-${runId.slice(0, 6)}`, invoiceDate: '2026-09-22', terms: 'Net 15', currency: 'USD', lines: [], total: 12648 };
    await store.record('finance', runId, 'PO-4502', invoice, 'rejected', []);
    await store.record('finance', runId, 'PO-4502', invoice, 'rejected', []);
    expect(await sql(`SELECT outcome, vendor_key FROM finance.invoices WHERE run_id = $1`, [runId])).toEqual([{ outcome: 'rejected', vendor_key: 'summit office interiors' }]);
    await expect(store.record('finance', runId, 'PO-4502', invoice, 'approved', [])).rejects.toThrow('already recorded');
    // A rejected invoice is not a duplicate: a corrected resubmission may reuse its number.
    expect(await store.isDuplicate('finance', invoice, randomUUID())).toBe(false);
  });
});
