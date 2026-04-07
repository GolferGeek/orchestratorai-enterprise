import { presentationWalker } from './walker';
import type {
  PresentationEvent,
  WorkflowPresentation,
} from './workflow-presentation';

const baseManifest: WorkflowPresentation = {
  agentSlug: 'legal-department',
  stages: [
    { id: 'read', label: 'Reading your document' },
    { id: 'classify', label: 'Classifying the document' },
    { id: 'contract', label: 'Reviewing contract terms', conditional: true },
    { id: 'ip', label: 'Reviewing intellectual property', conditional: true },
    { id: 'employment', label: 'Reviewing employment provisions', conditional: true },
    { id: 'synthesize', label: 'Synthesizing the analysis' },
    { id: 'report', label: 'Writing your final report' },
  ],
  suppress: [
    { hookEventType: 'agent.llm.started' },
    { hookEventType: 'agent.llm.completed' },
    { hookEventType: 'agent.llm.failed' },
  ],
  activators: [
    {
      match: { step: 'clo_routing_complete' },
      fromPayloadPath: 'payload/data/selectedSpecialists',
    },
  ],
  rules: [
    { stage: 'read', match: { step: 'echo' }, kind: 'start' },
    { stage: 'read', match: { step: 'echo_complete' }, kind: 'complete' },
    { stage: 'read', match: { step: 'echo_skip' }, kind: 'complete' },
    { stage: 'classify', match: { step: 'clo_routing' }, kind: 'start' },
    { stage: 'classify', match: { step: 'clo_routing_complete' }, kind: 'complete' },
    { stage: 'contract', match: { stepPrefix: 'contract_agent' } },
    { stage: 'contract', match: { step: 'contract_agent_complete' }, kind: 'complete' },
    { stage: 'ip', match: { stepPrefix: 'ip_agent' } },
    { stage: 'ip', match: { step: 'ip_agent_complete' }, kind: 'complete' },
    { stage: 'employment', match: { stepPrefix: 'employment_agent' } },
    { stage: 'employment', match: { step: 'employment_agent_complete' }, kind: 'complete' },
    { stage: 'synthesize', match: { step: 'synthesis' }, kind: 'start' },
    { stage: 'synthesize', match: { step: 'synthesis_complete' }, kind: 'complete' },
    { stage: 'report', match: { step: 'report_generation' }, kind: 'start' },
    { stage: 'report', match: { step: 'report_complete' }, kind: 'complete' },
  ],
};

function ev(partial: Partial<PresentationEvent>): PresentationEvent {
  return {
    hook_event_type: null,
    step: null,
    message: null,
    created_at: null,
    timestamp: null,
    payload: null,
    ...partial,
  };
}

describe('presentationWalker', () => {
  it('returns all-pending start state with no events; conditional stages remain pending until activated', () => {
    const result = presentationWalker(baseManifest, []);
    // All non-conditional stages pending; conditional stages still in result but pending
    const map = Object.fromEntries(result.map((s) => [s.id, s.state]));
    expect(map.read).toBe('pending');
    expect(map.classify).toBe('pending');
    expect(map.synthesize).toBe('pending');
    expect(map.report).toBe('pending');
    // Conditional stages: pending → skipped after the walk because no activator fired
    expect(map.contract).toBe('skipped');
    expect(map.ip).toBe('skipped');
    expect(map.employment).toBe('skipped');
  });

  it('suppress rules drop matching events before any other rule runs', () => {
    const events = [
      ev({ hook_event_type: 'agent.llm.started', step: 'llm' }),
      ev({ hook_event_type: 'agent.llm.completed', step: 'llm' }),
    ];
    const result = presentationWalker(baseManifest, events);
    // No state change — read is still pending (we suppressed everything)
    expect(result.find((s) => s.id === 'read')?.state).toBe('pending');
  });

  it('event rules tick stages from pending → active → done', () => {
    const events = [
      ev({ step: 'echo', timestamp: 1000 }),
      ev({ step: 'echo_complete', timestamp: 2000 }),
    ];
    const result = presentationWalker(baseManifest, events);
    const read = result.find((s) => s.id === 'read');
    expect(read?.state).toBe('done');
    expect(read?.startedAt).toBe(new Date(1000).toISOString());
    expect(read?.completedAt).toBe(new Date(2000).toISOString());
  });

  it('inferKind detects completion from hook_event_type ending in .completed', () => {
    const manifest: WorkflowPresentation = {
      agentSlug: 'test',
      stages: [{ id: 'a', label: 'A' }],
      rules: [{ stage: 'a', match: { hookEventType: 'thing.started' } }, { stage: 'a', match: { hookEventType: 'thing.completed' } }],
    };
    const result = presentationWalker(manifest, [
      ev({ hook_event_type: 'thing.started' }),
      ev({ hook_event_type: 'thing.completed' }),
    ]);
    expect(result[0]?.state).toBe('done');
  });

  it('activator promotes the conditional stages named in payload', () => {
    const events = [
      ev({ step: 'echo', timestamp: 1000 }),
      ev({ step: 'echo_complete', timestamp: 1500 }),
      ev({ step: 'clo_routing', timestamp: 2000 }),
      ev({
        step: 'clo_routing_complete',
        timestamp: 3000,
        payload: { data: { selectedSpecialists: ['contract', 'ip'] } },
      }),
    ];
    const result = presentationWalker(baseManifest, events);
    // contract + ip should be activated (still pending — no contract events yet)
    expect(result.find((s) => s.id === 'contract')?.state).toBe('pending');
    expect(result.find((s) => s.id === 'ip')?.state).toBe('pending');
    // employment NOT in selectedSpecialists → ends up skipped
    expect(result.find((s) => s.id === 'employment')?.state).toBe('skipped');
  });

  it('events for non-activated conditional stages are ignored', () => {
    // Only "ip" is selected. A contract event arrives — it should NOT
    // promote contract from pending.
    const events = [
      ev({
        step: 'clo_routing_complete',
        timestamp: 1000,
        payload: { data: { selectedSpecialists: ['ip'] } },
      }),
      ev({ step: 'contract_agent', timestamp: 2000 }),
      ev({ step: 'ip_agent', timestamp: 3000 }),
    ];
    const result = presentationWalker(baseManifest, events);
    expect(result.find((s) => s.id === 'contract')?.state).toBe('skipped');
    expect(result.find((s) => s.id === 'ip')?.state).toBe('active');
  });

  it('a fail event marks the matching stage as failed and captures the message', () => {
    const events = [
      ev({ step: 'echo', timestamp: 1000 }),
      ev({
        step: 'echo_complete',
        hook_event_type: 'langgraph.failed',
        message: 'metadata extraction crashed',
        timestamp: 1500,
      }),
    ];
    const result = presentationWalker(baseManifest, events);
    const read = result.find((s) => s.id === 'read');
    expect(read?.state).toBe('failed');
    expect(read?.errorMessage).toBe('metadata extraction crashed');
  });

  it('full happy path: echo → CLO → contract+ip → synthesize → report', () => {
    const events: PresentationEvent[] = [
      ev({ step: 'echo', timestamp: 100 }),
      ev({ step: 'echo_skip', timestamp: 200 }),
      ev({ step: 'clo_routing', timestamp: 300 }),
      ev({
        step: 'clo_routing_complete',
        timestamp: 400,
        payload: { data: { selectedSpecialists: ['contract', 'ip'] } },
      }),
      ev({ step: 'contract_agent', timestamp: 500 }),
      ev({ step: 'contract_agent_llm_call', timestamp: 600 }),
      ev({ step: 'contract_agent_complete', timestamp: 1500 }),
      ev({ step: 'ip_agent', timestamp: 1600 }),
      ev({ step: 'ip_agent_complete', timestamp: 2500 }),
      ev({ step: 'synthesis', timestamp: 2600 }),
      ev({ step: 'synthesis_complete', timestamp: 3500 }),
      ev({ step: 'report_generation', timestamp: 3600 }),
      ev({ step: 'report_complete', timestamp: 4500 }),
    ];
    const result = presentationWalker(baseManifest, events);
    const map = Object.fromEntries(result.map((s) => [s.id, s.state]));
    expect(map.read).toBe('done');
    expect(map.classify).toBe('done');
    expect(map.contract).toBe('done');
    expect(map.ip).toBe('done');
    expect(map.employment).toBe('skipped');
    expect(map.synthesize).toBe('done');
    expect(map.report).toBe('done');
  });

  it('mid-run state: stages still active when the walk ends', () => {
    const events: PresentationEvent[] = [
      ev({ step: 'echo', timestamp: 100 }),
      ev({ step: 'echo_complete', timestamp: 200 }),
      ev({ step: 'clo_routing', timestamp: 300 }),
      // Job is still running — clo_routing hasn't completed yet
    ];
    const result = presentationWalker(baseManifest, events);
    expect(result.find((s) => s.id === 'read')?.state).toBe('done');
    expect(result.find((s) => s.id === 'classify')?.state).toBe('active');
    expect(result.find((s) => s.id === 'synthesize')?.state).toBe('pending');
  });

  it('payload path activator with object instead of array yields no activations', () => {
    const events = [
      ev({
        step: 'clo_routing_complete',
        payload: { data: { selectedSpecialists: 'not-an-array' } },
      }),
    ];
    const result = presentationWalker(baseManifest, events);
    expect(result.find((s) => s.id === 'contract')?.state).toBe('skipped');
  });

  it('rules with empty match objects do not match anything (defensive)', () => {
    const manifest: WorkflowPresentation = {
      agentSlug: 'test',
      stages: [{ id: 's', label: 'S' }],
      rules: [{ stage: 's', match: {} }],
    };
    const events = [ev({ step: 'anything' })];
    const result = presentationWalker(manifest, events);
    expect(result[0]?.state).toBe('pending');
  });

  it('payloadEquals matches when the slash path equals the expected value', () => {
    const manifest: WorkflowPresentation = {
      agentSlug: 'test',
      stages: [
        { id: 'writing', label: 'Writing' },
        { id: 'editing', label: 'Editing' },
      ],
      rules: [
        {
          stage: 'writing',
          match: {
            step: 'phase_changed',
            payloadEquals: { 'payload/data/phase': 'writing' },
          },
          kind: 'start',
        },
        {
          stage: 'writing',
          match: {
            step: 'phase_changed',
            payloadEquals: { 'payload/data/phase': 'editing' },
          },
          kind: 'complete',
        },
        {
          stage: 'editing',
          match: {
            step: 'phase_changed',
            payloadEquals: { 'payload/data/phase': 'editing' },
          },
          kind: 'start',
        },
      ],
    };
    const events = [
      ev({
        step: 'phase_changed',
        payload: { data: { phase: 'writing' } },
      }),
      ev({
        step: 'phase_changed',
        payload: { data: { phase: 'editing' } },
      }),
    ];
    const result = presentationWalker(manifest, events);
    expect(result.find((s) => s.id === 'writing')?.state).toBe('done');
    expect(result.find((s) => s.id === 'editing')?.state).toBe('active');
  });

  it('payloadEquals does NOT match when the path value differs', () => {
    const manifest: WorkflowPresentation = {
      agentSlug: 'test',
      stages: [{ id: 'writing', label: 'Writing' }],
      rules: [
        {
          stage: 'writing',
          match: {
            step: 'phase_changed',
            payloadEquals: { 'payload/data/phase': 'writing' },
          },
          kind: 'start',
        },
      ],
    };
    const events = [
      ev({
        step: 'phase_changed',
        payload: { data: { phase: 'editing' } },
      }),
    ];
    const result = presentationWalker(manifest, events);
    expect(result[0]?.state).toBe('pending');
  });

  it('payloadEquals requires the step matcher to also pass (AND semantics)', () => {
    const manifest: WorkflowPresentation = {
      agentSlug: 'test',
      stages: [{ id: 'writing', label: 'Writing' }],
      rules: [
        {
          stage: 'writing',
          match: {
            step: 'phase_changed',
            payloadEquals: { 'payload/data/phase': 'writing' },
          },
          kind: 'start',
        },
      ],
    };
    // Right payload but wrong step name → no match.
    const events = [
      ev({
        step: 'something_else',
        payload: { data: { phase: 'writing' } },
      }),
    ];
    const result = presentationWalker(manifest, events);
    expect(result[0]?.state).toBe('pending');
  });
});
