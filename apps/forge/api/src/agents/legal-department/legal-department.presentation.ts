/**
 * LegalDepartmentPresentation — the user-facing stage manifest for the
 * Legal Department workflow.
 *
 * Colocated with the graph and the service so the team that owns the
 * workflow also owns the words the user reads. Edit this file to rename
 * a stage, change a description, or add a new conditional specialist.
 *
 * The walker (in @orchestrator-ai/transport-types) consumes this manifest
 * to turn raw observability events into a stage ladder for the in-row
 * ticker and the modal events tab.
 *
 * Reference: docs/efforts/current/prd.md §4.1
 */
import type { WorkflowPresentation } from '@orchestrator-ai/transport-types';

export const LEGAL_DEPARTMENT_PRESENTATION: WorkflowPresentation = {
  agentSlug: 'legal-department',
  version: '2026-04-07.1',

  // Stages render in this order. Conditional stages (the 8 specialists)
  // start hidden until the CLO routing event names them.
  stages: [
    {
      id: 'metadata',
      label: 'Reading your document',
      description:
        'Extracting metadata: document type, parties, dates, signatures.',
    },
    {
      id: 'clause_segmentation',
      label: 'Segmenting contract clauses',
      conditional: true,
      description:
        'Breaking the contract into individual clauses for per-clause analysis.',
    },
    {
      id: 'classify',
      label: 'Classifying the document',
      description: 'Routing to the right specialists based on document type.',
    },
    {
      id: 'contract',
      label: 'Reviewing contract terms',
      conditional: true,
      description:
        'Contract specialist: clauses, obligations, term, governing law.',
    },
    {
      id: 'compliance',
      label: 'Checking regulatory compliance',
      conditional: true,
      description:
        'Compliance specialist: regulatory exposure and required disclosures.',
    },
    {
      id: 'corporate',
      label: 'Reviewing corporate governance',
      conditional: true,
      description:
        'Corporate specialist: entities, governance, fiduciary duty.',
    },
    {
      id: 'employment',
      label: 'Reviewing employment provisions',
      conditional: true,
      description:
        'Employment specialist: at-will, classification, restrictive covenants.',
    },
    {
      id: 'ip',
      label: 'Reviewing intellectual property',
      conditional: true,
      description:
        'IP specialist: ownership, work-for-hire, licensing, IP warranties.',
    },
    {
      id: 'litigation',
      label: 'Reviewing dispute resolution',
      conditional: true,
      description:
        'Litigation specialist: dispute clauses, venue, arbitration, remedies.',
    },
    {
      id: 'privacy',
      label: 'Reviewing privacy and data clauses',
      conditional: true,
      description:
        'Privacy specialist: PII handling, GDPR/CCPA, data processing.',
    },
    {
      id: 'real_estate',
      label: 'Reviewing real estate provisions',
      conditional: true,
      description:
        'Real estate specialist: leases, easements, property rights.',
    },
    {
      id: 'synthesize',
      label: 'Synthesizing the analysis',
      description:
        'Combining specialist findings into a single coherent assessment.',
    },
    {
      id: 'hitl_review',
      label: 'Awaiting attorney review',
      description:
        'Paused for human-in-the-loop review. A reviewer must approve, reject, or modify the findings before the final report is generated.',
    },
    {
      id: 'report',
      label: 'Writing your final report',
      description: 'Generating the executive summary and recommendations.',
    },
  ],

  // Hide low-level instrumentation. Users see stage transitions, not LLM
  // call lifecycle events.
  suppress: [
    { hookEventType: 'agent.llm.started' },
    { hookEventType: 'agent.llm.completed' },
    { hookEventType: 'agent.llm.failed' },
    // Orchestrator bookkeeping is noise — users see the specialist stages
    // directly and don't need to know about the dispatcher.
    { stepPrefix: 'orchestrator_' },
  ],

  // Promote conditional stages when CLO routing decides which specialists
  // to invoke. The CLO emits a `clo_routing_complete` event whose payload
  // includes the selected specialist slugs (matching our stage ids).
  //
  // We deliberately do NOT use a static `activatesStageIds` backstop here.
  // The whole point of the conditional stages is that unselected ones get
  // marked `skipped` at end-of-walk, which only happens if they were
  // never activated. A backstop would activate everything and leave them
  // stuck in `pending` for the lifetime of the job.
  activators: [
    {
      match: { step: 'clo_routing_complete' },
      // The walker reads this slash-separated path on the event object
      // (event.payload.data.selectedSpecialists).
      fromPayloadPath: 'payload/data/selectedSpecialists',
    },
    // Belt-and-suspenders: if a specialist event arrives without the CLO
    // event having declared it (e.g. orchestrator routes to it directly),
    // promote that specific stage so its events register. Each specialist
    // gets its own activator keyed off its `_agent` step.
    // Clause segmentation activator (contract-review only)
    { match: { step: 'clause_segmentation' }, activatesStageIds: ['clause_segmentation'] },
    // Contract-review specialist activators (dash-separated names)
    { match: { step: 'contract-agent_contract_review' }, activatesStageIds: ['contract'] },
    { match: { step: 'compliance-agent_contract_review' }, activatesStageIds: ['compliance'] },
    { match: { step: 'corporate-agent_contract_review' }, activatesStageIds: ['corporate'] },
    { match: { step: 'employment-agent_contract_review' }, activatesStageIds: ['employment'] },
    { match: { step: 'ip-agent_contract_review' }, activatesStageIds: ['ip'] },
    { match: { step: 'litigation-agent_contract_review' }, activatesStageIds: ['litigation'] },
    { match: { step: 'privacy-agent_contract_review' }, activatesStageIds: ['privacy'] },
    { match: { step: 'real-estate-agent_contract_review' }, activatesStageIds: ['real_estate'] },
    // Document-onboarding specialist activators (underscore-separated names)
    { match: { step: 'contract_agent' }, activatesStageIds: ['contract'] },
    { match: { step: 'compliance_agent' }, activatesStageIds: ['compliance'] },
    { match: { step: 'corporate_agent' }, activatesStageIds: ['corporate'] },
    { match: { step: 'employment_agent' }, activatesStageIds: ['employment'] },
    { match: { step: 'ip_agent' }, activatesStageIds: ['ip'] },
    { match: { step: 'litigation_agent' }, activatesStageIds: ['litigation'] },
    { match: { step: 'privacy_agent' }, activatesStageIds: ['privacy'] },
    {
      match: { step: 'real_estate_agent' },
      activatesStageIds: ['real_estate'],
    },
  ],

  // Map raw observability events onto stage transitions. Step names match
  // what the legal-department nodes emit today (audited in Phase 1).
  rules: [
    // Metadata extraction (the worker's pre-graph LLM call)
    // We can't match the LLM call directly because suppress drops it.
    // Instead, the echo node fires immediately after metadata extraction
    // with step='echo' — that's our signal to start the metadata stage,
    // and we mark it complete when echo_complete (or echo_skip) fires.
    { stage: 'metadata', match: { step: 'echo' }, kind: 'start' },
    { stage: 'metadata', match: { step: 'echo_skip' }, kind: 'complete' },
    { stage: 'metadata', match: { step: 'echo_complete' }, kind: 'complete' },

    // Classification (CLO routing)
    { stage: 'classify', match: { step: 'clo_routing' }, kind: 'start' },
    {
      stage: 'classify',
      match: { step: 'clo_routing_complete' },
      kind: 'complete',
    },

    // Specialist nodes — each fires `{slug}_agent` to start, then
    // `{slug}_agent_llm_call` mid-flight, then `{slug}_agent_complete`.
    { stage: 'contract', match: { stepPrefix: 'contract_agent' } },
    {
      stage: 'contract',
      match: { step: 'contract_agent_complete' },
      kind: 'complete',
    },

    { stage: 'compliance', match: { stepPrefix: 'compliance_agent' } },
    {
      stage: 'compliance',
      match: { step: 'compliance_agent_complete' },
      kind: 'complete',
    },

    { stage: 'corporate', match: { stepPrefix: 'corporate_agent' } },
    {
      stage: 'corporate',
      match: { step: 'corporate_agent_complete' },
      kind: 'complete',
    },

    { stage: 'employment', match: { stepPrefix: 'employment_agent' } },
    {
      stage: 'employment',
      match: { step: 'employment_agent_complete' },
      kind: 'complete',
    },

    { stage: 'ip', match: { stepPrefix: 'ip_agent' } },
    { stage: 'ip', match: { step: 'ip_agent_complete' }, kind: 'complete' },

    { stage: 'litigation', match: { stepPrefix: 'litigation_agent' } },
    {
      stage: 'litigation',
      match: { step: 'litigation_agent_complete' },
      kind: 'complete',
    },

    { stage: 'privacy', match: { stepPrefix: 'privacy_agent' } },
    {
      stage: 'privacy',
      match: { step: 'privacy_agent_complete' },
      kind: 'complete',
    },

    { stage: 'real_estate', match: { stepPrefix: 'real_estate_agent' } },
    {
      stage: 'real_estate',
      match: { step: 'real_estate_agent_complete' },
      kind: 'complete',
    },

    // Synthesis
    { stage: 'synthesize', match: { stepPrefix: 'synthesis' } },
    {
      stage: 'synthesize',
      match: { step: 'synthesis_complete' },
      kind: 'complete',
    },

    // HITL review — the hitl-checkpoint node emits `hitl_checkpoint_start`
    // when it pauses (awaiting reviewer) and `hitl_checkpoint_complete`
    // when it resumes with a decision.
    {
      stage: 'hitl_review',
      match: { step: 'hitl_checkpoint_start' },
      kind: 'start',
    },
    {
      stage: 'hitl_review',
      match: { step: 'hitl_checkpoint_complete' },
      kind: 'complete',
    },

    // Final report (note the existing convention is `report_complete`,
    // not `report_generation_complete`)
    { stage: 'report', match: { stepPrefix: 'report_generation' } },
    { stage: 'report', match: { step: 'report_complete' }, kind: 'complete' },

    // ── Contract-review workflow steps ──────────────────────────────
    // The contract-review workflow uses `cr_` prefixed steps and has
    // a clause segmentation pre-processing stage.

    // Metadata extraction (worker pre-graph, shared with doc-onboarding)
    { stage: 'metadata', match: { step: 'metadata_extraction' }, kind: 'start' },
    { stage: 'metadata', match: { step: 'metadata_complete' }, kind: 'complete' },

    // Clause segmentation (contract-review only)
    { stage: 'clause_segmentation', match: { step: 'clause_segmentation' }, kind: 'start' },
    { stage: 'clause_segmentation', match: { step: 'clause_segmentation_complete' }, kind: 'complete' },

    // Contract-review specialists use `_contract_review` suffix
    { stage: 'contract', match: { step: 'contract-agent_contract_review' } },
    { stage: 'contract', match: { step: 'contract-agent_contract_review_done' }, kind: 'complete' },
    { stage: 'compliance', match: { step: 'compliance-agent_contract_review' } },
    { stage: 'compliance', match: { step: 'compliance-agent_contract_review_done' }, kind: 'complete' },
    { stage: 'corporate', match: { step: 'corporate-agent_contract_review' } },
    { stage: 'corporate', match: { step: 'corporate-agent_contract_review_done' }, kind: 'complete' },
    { stage: 'employment', match: { step: 'employment-agent_contract_review' } },
    { stage: 'employment', match: { step: 'employment-agent_contract_review_done' }, kind: 'complete' },
    { stage: 'ip', match: { step: 'ip-agent_contract_review' } },
    { stage: 'ip', match: { step: 'ip-agent_contract_review_done' }, kind: 'complete' },
    { stage: 'litigation', match: { step: 'litigation-agent_contract_review' } },
    { stage: 'litigation', match: { step: 'litigation-agent_contract_review_done' }, kind: 'complete' },
    { stage: 'privacy', match: { step: 'privacy-agent_contract_review' } },
    { stage: 'privacy', match: { step: 'privacy-agent_contract_review_done' }, kind: 'complete' },
    { stage: 'real_estate', match: { step: 'real-estate-agent_contract_review' } },
    { stage: 'real_estate', match: { step: 'real-estate-agent_contract_review_done' }, kind: 'complete' },

    // Contract-review orchestrator
    { stage: 'classify', match: { step: 'cr_orchestrator_start' }, kind: 'start' },
    { stage: 'classify', match: { step: 'cr_orchestrator_complete' }, kind: 'complete' },

    // Contract-review synthesis
    { stage: 'synthesize', match: { step: 'cr_synthesis' }, kind: 'start' },
    { stage: 'synthesize', match: { step: 'cr_synthesis_complete' }, kind: 'complete' },

    // Contract-review HITL
    { stage: 'hitl_review', match: { step: 'cr_hitl_start' }, kind: 'start' },
    { stage: 'hitl_review', match: { step: 'cr_hitl_complete' }, kind: 'complete' },

    // Contract-review report
    { stage: 'report', match: { step: 'cr_report' }, kind: 'start' },
    { stage: 'report', match: { step: 'cr_report_complete' }, kind: 'complete' },

    // Workflow start (worker pre-graph)
    { stage: 'metadata', match: { step: 'workflow_start' }, kind: 'complete' },
  ],
};
