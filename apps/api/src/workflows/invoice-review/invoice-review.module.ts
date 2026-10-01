import { Inject, Module, OnModuleInit } from '@nestjs/common';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { CHECKPOINT_SAVER } from '@orchestratorai/planes/checkpointer';
import { WorkflowRegistry } from '../catalog/workflow.registry';
import { WorkflowDocumentsService } from '../shared/documents/workflow-documents.service';
import { WorkflowExporterRegistry } from '../shared/export';
import { IssueLedgerService } from '../shared/ledger';
import { WorkflowRestartService } from '../shared/restarts';
import { WorkflowHandlerRegistry, createGraphHandler } from '../shared/runs';
import { WorkUnitService } from '../shared/work-units';
import { GatehouseModule } from '../../gatehouse/gatehouse.module';
import { PartnerCallsService } from '../../gatehouse/partner-calls.service';
import { FinanceStoreService } from './finance-store.service';
import { invoiceReviewExporter } from './invoice-review.exporter';
import { createInvoiceReviewGraph } from './invoice-review.graph';
import { INVOICE_REVIEW_SLUG, invoiceReviewRunTitle, parseInvoiceReviewInput } from './invoice-review.input';
import { invoiceReviewResult } from './invoice-review.result';
import type { InvoiceReviewState } from './invoice-review.state';
import { PurchaseOrdersController } from './purchase-orders.controller';

/**
 * Finance's invoice exception review: extract the invoice, three-way match it
 * against the PO and receipts (FIN-POL-004), check with Jev, approve clean
 * invoices automatically and send exceptions to a person.
 */
@Module({
  imports: [GatehouseModule],
  controllers: [PurchaseOrdersController],
  providers: [FinanceStoreService],
})
export class InvoiceReviewModule implements OnModuleInit {
  constructor(
    private readonly registry: WorkflowRegistry,
    private readonly handlers: WorkflowHandlerRegistry,
    private readonly exporters: WorkflowExporterRegistry,
    private readonly units: WorkUnitService,
    private readonly restarts: WorkflowRestartService,
    private readonly ledger: IssueLedgerService,
    private readonly documents: WorkflowDocumentsService,
    private readonly store: FinanceStoreService,
    private readonly partners: PartnerCallsService,
    @Inject(CHECKPOINT_SAVER) private readonly checkpointer: BaseCheckpointSaver,
  ) {}

  onModuleInit(): void {
    const graph = createInvoiceReviewGraph({ units: this.units, store: this.store, documents: this.documents, ledger: this.ledger, partners: this.partners, checkpointer: this.checkpointer });
    this.handlers.register(
      createGraphHandler<InvoiceReviewState>({
        slug: INVOICE_REVIEW_SLUG,
        graph,
        restarts: this.restarts,
        start: (run) => ({ ...parseInvoiceReviewInput(run.input), documents: run.documents }),
        result: invoiceReviewResult,
      }),
    );
    this.exporters.register(invoiceReviewExporter);
    this.registry.register({
      slug: INVOICE_REVIEW_SLUG,
      name: 'Invoice Exception Review',
      description: 'Match an invoice to its purchase order and receipts; clean invoices are approved automatically, exceptions go to the budget owner with the reason.',
      organizationSlugs: ['finance'],
      icon: 'receipt',
      defaultGroup: 'Accounts Payable',
      defaultLifecycle: 'dev',
      hitl: true,
      dataClassification: 'confidential',
      entryPoint: {
        kind: 'runtime',
        maxAttempts: 2,
        modelRoles: ['analyst'],
        accessControl: { mode: 'org' },
        parseStartInput: (input) => ({ ...parseInvoiceReviewInput(input) }),
        runTitle: invoiceReviewRunTitle,
        restartPoints: { 'extract-invoice': { resumeAt: 'match' } },
      },
    });
  }
}
