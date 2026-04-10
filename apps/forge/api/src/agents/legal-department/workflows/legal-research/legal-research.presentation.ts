/**
 * LegalResearchPresentation — the user-facing stage manifest for the
 * Legal Research Deep Dive workflow.
 *
 * This is a separate manifest from the document-analysis workflow because
 * the research workflow has a fundamentally different execution model:
 * recursive sub-question expansion, citation grounding, and budget controls.
 *
 * Registered as agentSlug: 'legal-department', jobType: 'legal-research'.
 * The API's presentation endpoint serves this when the job has
 * metadata.jobType === 'legal-research'.
 *
 * See: docs/efforts/current/legal-research-deep-dive/prd.md §4.1
 */
import type { WorkflowPresentation } from '@orchestrator-ai/transport-types';

export const LEGAL_RESEARCH_PRESENTATION: WorkflowPresentation = {
  agentSlug: 'legal-department',
  version: '2026-04-10.1',

  stages: [
    {
      id: 'question_analysis',
      label: 'Analysing your question',
      description:
        'Breaking down the legal question into structured research targets and identifying jurisdiction and practice area.',
    },
    {
      id: 'researching',
      label: 'Researching',
      description:
        'Running recursive sub-question expansion and grounding each question in the document knowledge base.',
    },
    {
      id: 'synthesizing',
      label: 'Synthesizing memo',
      description:
        'Combining all research findings into a structured legal memo.',
    },
    {
      id: 'hitl_review',
      label: 'Awaiting review',
      description:
        'Paused for attorney review. A reviewer must approve the research findings before the final report is generated.',
    },
    {
      id: 'report',
      label: 'Generating report',
      description: 'Producing the final research report and export package.',
    },
  ],

  suppress: [
    { hookEventType: 'agent.llm.started' },
    { hookEventType: 'agent.llm.completed' },
    { hookEventType: 'agent.llm.failed' },
  ],

  activators: [],

  rules: [
    // Question analysis / decomposition
    { stage: 'question_analysis', match: { step: 'question_analysis' }, kind: 'start' },
    { stage: 'question_analysis', match: { step: 'question_analysis_complete' }, kind: 'complete' },

    // Research loop (depth_controller + research_dispatcher + node_researcher)
    { stage: 'researching', match: { step: 'depth_controller' }, kind: 'start' },
    { stage: 'researching', match: { step: 'research_dispatcher' } },
    { stage: 'researching', match: { step: 'node_researcher' } },
    { stage: 'researching', match: { step: 'node_researcher_complete' } },
    { stage: 'researching', match: { step: 'budget_check' } },
    { stage: 'researching', match: { step: 'research_complete' }, kind: 'complete' },

    // Synthesis
    { stage: 'synthesizing', match: { step: 'memo_synthesizer' }, kind: 'start' },
    { stage: 'synthesizing', match: { step: 'memo_synthesizer_complete' }, kind: 'complete' },

    // HITL checkpoint
    { stage: 'hitl_review', match: { step: 'hitl_checkpoint_start' }, kind: 'start' },
    { stage: 'hitl_review', match: { step: 'hitl_checkpoint_complete' }, kind: 'complete' },

    // Final report
    { stage: 'report', match: { stepPrefix: 'report_generation' }, kind: 'start' },
    { stage: 'report', match: { step: 'report_complete' }, kind: 'complete' },
  ],
};
