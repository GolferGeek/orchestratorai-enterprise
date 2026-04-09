import { Controller, Get } from '@nestjs/common';
import { Public } from '@orchestratorai/auth-client';

/**
 * Implements the .well-known/agent.json discovery endpoint per A2A protocol standard.
 * External agents discover Bridge's capabilities by fetching this endpoint.
 * Format follows JSON-RPC 2.0 A2A agent card standard from transport-types.
 */
// A2A agent discovery
@Public()
@Controller('.well-known')
export class WellKnownController {
  @Get('agent.json')
  getAgentCard() {
    const baseUrl = process.env.BRIDGE_BASE_URL ?? `http://localhost:${process.env.PORT ?? '5600'}`;

    return {
      id: 'orchestratorai-bridge',
      name: 'OrchestratorAI Bridge',
      description: 'External A2A communication gateway — inbound and outbound agent conversations with external agents',
      url: baseUrl,
      version: '0.1.0',
      capabilities: [
        {
          id: 'a2a-inbound',
          name: 'A2A Inbound',
          description: 'Receive A2A task requests from external agents via JSON-RPC 2.0',
        },
        {
          id: 'a2a-outbound',
          name: 'A2A Outbound',
          description: 'Send A2A task requests to registered external agents',
        },
        {
          id: 'agent-discovery',
          name: 'Agent Discovery',
          description: 'Discover and register external agents via .well-known/agent.json',
        },
        {
          id: 'trust-validation',
          name: 'Trust Validation',
          description: 'Validate request signatures and enforce trust policies for external agents',
        },
      ],
      endpoints: [
        {
          path: '/a2a/tasks',
          method: 'POST',
          description: 'Receive inbound A2A task requests (JSON-RPC 2.0)',
          type: 'a2a-jsonrpc',
          requiresSignature: true,
        },
        {
          path: '/a2a/send',
          method: 'POST',
          description: 'Send outbound A2A task requests to external agents',
          type: 'a2a-jsonrpc',
          requiresAuth: true,
        },
        {
          path: '/registry/agents',
          method: 'GET',
          description: 'List registered external agents',
          type: 'rest',
          requiresAuth: true,
        },
      ],
      protocols: {
        discovery: ['well-known'],
        transport: ['a2a-jsonrpc', 'http-rest'],
        negotiation: ['a2a-skill-negotiation', 'capability-card'],
        identity: ['oauth-jwt', 'local-keys'],
        payment: ['mock'],
        trust: ['allowlist', 'reputation', 'a2a-jws-trust'],
        encryption: ['tls-mutual', 'envelope'],
        resilience: ['retry', 'circuit-breaker'],
        observability: ['opentelemetry', 'file-log'],
        audit: ['hash-chain'],
      },
      security: {
        requestSigning: true,
        signatureAlgorithm: 'HMAC-SHA256',
        originValidation: true,
        rateLimiting: {
          enabled: true,
          windowMs: 60000,
          maxRequests: 100,
        },
      },
    };
  }
}
