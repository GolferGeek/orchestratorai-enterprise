import { Injectable, Logger } from '@nestjs/common';

export interface ScenarioStep {
  id: string;
  name: string;
  description: string;
  action: 'observe' | 'trigger' | 'verify';
  expected?: string;
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  category: 'db-watcher' | 'file-watcher' | 'workflow' | 'training';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  steps: ScenarioStep[];
  trainingNotes?: string;
  outcomeVerification?: string;
}

export interface ScenarioOutcome {
  scenarioId: string;
  runId: string;
  status: 'passed' | 'failed' | 'partial';
  completedAt: string;
  stepResults: Record<string, 'passed' | 'failed' | 'skipped'>;
  notes?: string;
}

/**
 * Manages guided training scenarios for Pulse.
 *
 * Scenarios are step-by-step walkthroughs that help users understand
 * the ambient automation system. Each scenario demonstrates a specific
 * event-driven pattern with verifiable outcomes.
 *
 * Ported from agent-communication scenario pattern — stripped of
 * external A2A and payment complexity, focused on internal Pulse patterns.
 */
@Injectable()
export class ScenariosService {
  private readonly logger = new Logger(ScenariosService.name);
  private readonly outcomes: ScenarioOutcome[] = [];

  private readonly scenarios: ScenarioDefinition[] = [
    {
      id: 'scenario-db-change-trigger',
      name: 'Database Change Triggers Workflow',
      description:
        'Demonstrates how a Supabase table change event automatically triggers a Pulse workflow. A row is inserted, the DB watcher fires, and the workflow executor runs the configured steps.',
      category: 'db-watcher',
      difficulty: 'beginner',
      steps: [
        {
          id: 'step-1',
          name: 'Observe DB Watcher',
          description: 'Confirm the db-watcher-main listener is active in the Listeners panel.',
          action: 'observe',
          expected: 'Listener shows status: active',
        },
        {
          id: 'step-2',
          name: 'Simulate DB Insert',
          description: 'Use POST /listeners/simulate/db with eventType: INSERT to simulate a table change.',
          action: 'trigger',
          expected: 'SSE stream shows listener.fired event for db-watcher',
        },
        {
          id: 'step-3',
          name: 'Verify SSE Event',
          description: 'Check the /streaming/events SSE stream for the listener.fired event.',
          action: 'verify',
          expected: 'Event received with type: listener.fired and listenerType: db-watcher',
        },
      ],
      trainingNotes:
        'In production, the DB watcher connects to Supabase Realtime and fires automatically. This scenario uses the simulation endpoint to demonstrate the event flow without requiring a live database change.',
      outcomeVerification:
        'SSE stream shows listener.fired event within 1 second of simulation call.',
    },
    {
      id: 'scenario-file-change-trigger',
      name: 'File System Change Triggers Workflow',
      description:
        'Demonstrates how a file system change event triggers a Pulse workflow. A file is created/modified, the file watcher fires, and downstream workflows execute.',
      category: 'file-watcher',
      difficulty: 'beginner',
      steps: [
        {
          id: 'step-1',
          name: 'Observe File Watcher',
          description: 'Confirm the file-watcher-main listener is active.',
          action: 'observe',
          expected: 'Listener shows status: active',
        },
        {
          id: 'step-2',
          name: 'Simulate File Event',
          description: 'Use POST /listeners/simulate/file with path and eventType: created.',
          action: 'trigger',
          expected: 'SSE stream shows listener.fired event for file-watcher',
        },
        {
          id: 'step-3',
          name: 'Verify Workflow Trigger',
          description: 'Check /workflows/runs to see if any file-change workflows were triggered.',
          action: 'verify',
          expected: 'Workflow run appears in the runs list with triggeredBy: file-change',
        },
      ],
      trainingNotes:
        'In production, the file watcher uses Node.js fs.watch or chokidar to monitor configured directories. This scenario uses simulation to demonstrate the flow.',
    },
    {
      id: 'scenario-manual-workflow',
      name: 'Manual Workflow Execution',
      description:
        'Demonstrates manually triggering a workflow and tracking its execution through the SSE stream.',
      category: 'workflow',
      difficulty: 'beginner',
      steps: [
        {
          id: 'step-1',
          name: 'List Available Workflows',
          description: 'Call GET /workflows to see registered workflow definitions.',
          action: 'observe',
          expected: 'Response shows list of workflow definitions',
        },
        {
          id: 'step-2',
          name: 'Execute Workflow',
          description: 'Call POST /workflows/:id/execute with optional triggerData.',
          action: 'trigger',
          expected: 'Response returns 202 with workflow run details',
        },
        {
          id: 'step-3',
          name: 'Monitor SSE Stream',
          description: 'Watch /streaming/events for workflow.triggered and workflow.completed events.',
          action: 'verify',
          expected: 'Both workflow.triggered and workflow.completed events appear in SSE stream',
        },
      ],
      trainingNotes:
        'Manual execution is useful for testing workflow definitions before connecting them to event triggers.',
    },
    {
      id: 'scenario-sse-streaming',
      name: 'SSE Event Streaming',
      description:
        'Demonstrates the platform-standard SSE streaming endpoint and how to consume real-time events from Pulse.',
      category: 'training',
      difficulty: 'beginner',
      steps: [
        {
          id: 'step-1',
          name: 'Connect to SSE Stream',
          description: 'Open an EventSource to GET /streaming/events.',
          action: 'observe',
          expected: 'Receives connected event immediately',
        },
        {
          id: 'step-2',
          name: 'Trigger an Event',
          description: 'Simulate a DB or file event to generate SSE output.',
          action: 'trigger',
          expected: 'Event appears in SSE stream within 100ms',
        },
        {
          id: 'step-3',
          name: 'Verify Format',
          description: 'Confirm event format matches platform standard: data: JSON\\n\\n',
          action: 'verify',
          expected: 'Events use text/event-stream format with JSON-encoded data',
        },
      ],
      trainingNotes:
        'The Pulse SSE endpoint uses the platform-standard format (Content-Type: text/event-stream, Cache-Control: no-cache, Connection: keep-alive, data: JSON\\n\\n). This matches Forge API and Bridge.',
    },
  ];

  list(): ScenarioDefinition[] {
    return this.scenarios;
  }

  getById(id: string): ScenarioDefinition | undefined {
    return this.scenarios.find((s) => s.id === id);
  }

  getByCategory(category: ScenarioDefinition['category']): ScenarioDefinition[] {
    return this.scenarios.filter((s) => s.category === category);
  }

  recordOutcome(outcome: ScenarioOutcome): void {
    this.outcomes.push(outcome);
    this.logger.log(`Scenario outcome recorded: ${outcome.scenarioId} — ${outcome.status}`);
    if (this.outcomes.length > 500) {
      this.outcomes.shift();
    }
  }

  getOutcomes(scenarioId?: string): ScenarioOutcome[] {
    if (scenarioId) {
      return this.outcomes.filter((o) => o.scenarioId === scenarioId);
    }
    return [...this.outcomes].reverse();
  }
}
