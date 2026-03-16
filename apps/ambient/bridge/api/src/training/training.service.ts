import { Injectable } from '@nestjs/common';

/**
 * TrainingService — Built-in training docs and guided scenarios for Bridge.
 *
 * Bridge includes embedded training content to help users understand:
 * - External A2A protocol (inbound + outbound flows)
 * - Security hardening (signing, rate limiting, origin validation)
 * - Trust progression for external agents
 * - How to register and discover external agents
 *
 * This content is served by the API and displayed in the Bridge web UI.
 */

export interface ScenarioDescriptor {
  id: string;
  name: string;
  description: string;
  flow: 'inbound' | 'outbound' | 'discovery' | 'security';
  steps: ScenarioStep[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedMinutes: number;
}

export interface ScenarioStep {
  step: number;
  title: string;
  description: string;
  action: string;
  expectedOutcome: string;
  securityLayer?: string;
}

@Injectable()
export class TrainingService {
  listScenarios(): ScenarioDescriptor[] {
    return [
      {
        id: 'external-agent-discovery',
        name: 'External Agent Discovery',
        description: 'Register an external agent by fetching its .well-known/agent.json endpoint',
        flow: 'discovery',
        difficulty: 'beginner',
        estimatedMinutes: 5,
        steps: [
          {
            step: 1,
            title: 'POST to /registry/agents/discover',
            description: 'Send the external agent base URL to Bridge',
            action: 'POST /registry/agents/discover { "url": "https://external-agent.example.com" }',
            expectedOutcome: 'Bridge fetches .well-known/agent.json and returns agent info',
            securityLayer: 'discovery',
          },
          {
            step: 2,
            title: 'Verify registration',
            description: 'Confirm the agent appears in the registry',
            action: 'GET /registry/agents',
            expectedOutcome: 'Agent listed with status=online and trustScore=0',
          },
          {
            step: 3,
            title: 'Check origin is trusted',
            description: "Bridge automatically adds the agent's origin to the trusted list",
            action: 'Review Bridge security logs',
            expectedOutcome: 'Origin https://external-agent.example.com added to trusted origins',
          },
        ],
      },
      {
        id: 'inbound-a2a-request',
        name: 'Inbound A2A Request',
        description: 'An external agent sends a JSON-RPC 2.0 task request to Bridge',
        flow: 'inbound',
        difficulty: 'intermediate',
        estimatedMinutes: 10,
        steps: [
          {
            step: 1,
            title: 'External agent sends signed request',
            description: 'External agent POSTs to /a2a/tasks with JSON-RPC 2.0 payload and security envelope',
            action: 'POST /a2a/tasks with X-Agent-Id and X-Security-Envelope headers',
            expectedOutcome: 'Bridge validates origin, rate limit, format, and signature',
            securityLayer: 'identity',
          },
          {
            step: 2,
            title: 'Bridge validates the request',
            description: 'Origin validation, rate limiting, JSON-RPC format check, signature verification',
            action: 'Bridge processes security stack',
            expectedOutcome: 'All checks pass — request proceeds to routing',
            securityLayer: 'trust',
          },
          {
            step: 3,
            title: 'Bridge routes to internal agent',
            description: 'Method name determines which internal agent handles the request',
            action: 'compose.* → Compose API (port 6300), forge.* → Forge API (port 6200)',
            expectedOutcome: 'Request forwarded to correct internal product',
          },
          {
            step: 4,
            title: 'Response returned to external agent',
            description: 'Internal agent response is returned as JSON-RPC 2.0 result',
            action: 'Bridge returns { jsonrpc: "2.0", id, result: {...} }',
            expectedOutcome: 'External agent receives structured response',
          },
        ],
      },
      {
        id: 'outbound-a2a-request',
        name: 'Outbound A2A Request',
        description: 'Bridge sends a signed A2A request to a registered external agent',
        flow: 'outbound',
        difficulty: 'intermediate',
        estimatedMinutes: 10,
        steps: [
          {
            step: 1,
            title: 'Trigger outbound request',
            description: 'Internal system or admin triggers an outbound request via Bridge',
            action: 'POST /a2a/send { "targetAgentId": "...", "method": "...", "params": {...} }',
            expectedOutcome: 'Bridge looks up agent in registry',
          },
          {
            step: 2,
            title: 'Bridge signs the request',
            description: 'HMAC-SHA256 security envelope generated with nonce and timestamp',
            action: 'SigningService.generateEnvelope() called',
            expectedOutcome: 'Security envelope attached to outbound request headers',
            securityLayer: 'identity',
          },
          {
            step: 3,
            title: 'Request sent to external agent',
            description: "POST to external agent's /a2a/tasks endpoint",
            action: 'HTTP POST with X-Agent-Id and X-Security-Envelope headers',
            expectedOutcome: 'External agent receives and processes the request',
          },
          {
            step: 4,
            title: 'Trust score updated',
            description: 'Successful interaction increases the external agent trust score',
            action: 'ExternalRegistryService.incrementInteractions() called',
            expectedOutcome: 'Trust score +5, trust level may advance (neutral → trusted)',
            securityLayer: 'trust',
          },
        ],
      },
      {
        id: 'security-rejection',
        name: 'Security Rejection',
        description: 'Observe Bridge reject an inbound request due to security violations',
        flow: 'security',
        difficulty: 'advanced',
        estimatedMinutes: 15,
        steps: [
          {
            step: 1,
            title: 'Send from unknown origin',
            description: 'Send a request from an origin not in the trusted list',
            action: 'POST /a2a/tasks without prior agent registration',
            expectedOutcome: 'Error code -32003: Origin not trusted',
            securityLayer: 'trust',
          },
          {
            step: 2,
            title: 'Exceed rate limit',
            description: 'Send more than 100 requests within 1 minute',
            action: 'POST /a2a/tasks 101+ times from same agentId',
            expectedOutcome: 'Error code -32029: Rate limit exceeded',
          },
          {
            step: 3,
            title: 'Send with invalid signature',
            description: 'Send a request with a tampered security envelope',
            action: 'POST /a2a/tasks with modified signature in X-Security-Envelope',
            expectedOutcome: 'Error code -32002: Signature verification failed',
            securityLayer: 'identity',
          },
          {
            step: 4,
            title: 'Replay attack',
            description: 'Resend a request with the same nonce',
            action: 'POST /a2a/tasks with same nonce twice within 5 minutes',
            expectedOutcome: 'Error code -32001: Replay detected',
          },
        ],
      },
    ];
  }

  getScenario(id: string): ScenarioDescriptor | undefined {
    return this.listScenarios().find((s) => s.id === id);
  }

  getDocumentation() {
    return {
      overview: {
        title: 'Bridge — External A2A Communication Gateway',
        description: `
Bridge is the OrchestratorAI Enterprise product responsible for external agent-to-agent
communication. It sits at the trust boundary between internal agents (Forge, Compose) and
external agents outside the system.

Bridge applies production security hardening on all external-facing endpoints:
- Request signing (HMAC-SHA256)
- Rate limiting (per-agent, configurable window)
- Origin validation (allowlist-based)
- Replay protection (nonce tracking, 5-minute window)
- Timestamp validation (5-minute acceptance window)
        `.trim(),
      },
      ports: {
        api: 6600,
        web: 6601,
        apiProd: 7600,
        webProd: 7601,
      },
      keyEndpoints: [
        {
          method: 'GET',
          path: '/.well-known/agent.json',
          description: 'Agent card discovery — external agents use this to discover Bridge capabilities',
        },
        {
          method: 'POST',
          path: '/a2a/tasks',
          description: 'Inbound A2A — external agents send tasks here (JSON-RPC 2.0)',
        },
        {
          method: 'POST',
          path: '/a2a/send',
          description: 'Outbound A2A — send tasks to registered external agents',
        },
        {
          method: 'GET',
          path: '/registry/agents',
          description: 'List registered external agents',
        },
        {
          method: 'POST',
          path: '/registry/agents/discover',
          description: 'Discover and register an external agent via .well-known/agent.json',
        },
        {
          method: 'GET',
          path: '/stream/events',
          description: 'SSE stream — real-time Bridge events (inbound, outbound, security)',
        },
      ],
      securityLayers: [
        {
          name: 'Origin Validation',
          description: 'Only requests from registered external agent origins are accepted',
          config: 'ORIGIN_VALIDATION=strict|permissive, TRUSTED_ORIGINS=comma-separated',
        },
        {
          name: 'Rate Limiting',
          description: 'Per-agent request rate limiting with configurable window and max requests',
          config: 'RATE_LIMIT_WINDOW_MS=60000, RATE_LIMIT_MAX_REQUESTS=100',
        },
        {
          name: 'Request Signing',
          description: 'All outbound requests signed with HMAC-SHA256. Inbound signatures verified.',
          config: 'BRIDGE_SIGNING_KEY=<secret>, SECURITY_MODE=strict|permissive',
        },
        {
          name: 'Replay Protection',
          description: 'Nonce tracking prevents replay attacks within a 5-minute window',
          config: 'Automatic — no configuration required',
        },
      ],
    };
  }
}
