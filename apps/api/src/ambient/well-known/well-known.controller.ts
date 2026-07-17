import { Controller, Get } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator';

/**
 * Implements .well-known/agent.json discovery for A2A protocol compliance.
 * Transport types: JSON-RPC 2.0 per @orchestratorai/transport-types standard.
 */
// A2A agent discovery — must be reachable without auth for bootstrap.
@Public()
@Controller('ambient/.well-known')
export class WellKnownController {
  @Get('agent.json')
  getAgentCard() {
    return {
      id: 'ambient',
      name: 'Ambient — Internal Automation',
      description:
        'Listens to internal event sources (database changes, file system events, internal A2A messages) and triggers agent workflows automatically.',
      version: '0.1.0',
      product: 'ambient',
      type: 'ambient',
      capabilities: ['event-listening', 'workflow-execution', 'scenario-training', 'sse-streaming'],
      endpoints: {
        health: '/health',
        stream: '/ambient/streaming/events',
        scenarios: '/ambient/scenarios',
        workflows: '/ambient/workflows',
        listeners: '/ambient/listeners',
      },
      transport: 'json-rpc-2.0',
    };
  }
}
