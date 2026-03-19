import { Injectable } from '@nestjs/common';
import { AgentCard } from '@agent-communication/shared-types';

@Injectable()
export class AgentCardService {
  private readonly agentCard: AgentCard = {
    id: 'ascentek-app',
    name: 'Ascentek Manufacturing Ecosystem',
    description:
      'Specialty lubricant manufacturing supply chain fishbowl — formulator, manufacturer, OEM buyer',
    url: 'http://localhost:6408',
    version: '0.1.0',
    capabilities: [
      {
        id: 'formulation-lookup',
        name: 'Formulation Lookup',
        description: 'Look up lubricant formulations by specification or application',
      },
      {
        id: 'spec-validation',
        name: 'Spec Validation',
        description: 'Validate product formulations against OEM specifications',
      },
      {
        id: 'production-scheduling',
        name: 'Production Scheduling',
        description: 'Schedule manufacturing runs based on orders and capacity',
      },
      {
        id: 'quality-inspection',
        name: 'Quality Inspection',
        description: 'Perform quality checks on manufactured batches',
      },
      {
        id: 'po-submission',
        name: 'PO Submission',
        description: 'Submit and track purchase orders across the supply chain',
      },
    ],
    endpoints: [
      {
        path: '/agent/formulation',
        method: 'POST',
        description: 'Formulation lookup agent endpoint',
        type: 'agent',
        requiresPayment: false,
      },
      {
        path: '/agent/spec-validate',
        method: 'POST',
        description: 'Spec validation agent endpoint',
        type: 'agent',
        requiresPayment: false,
      },
      {
        path: '/agent/schedule',
        method: 'POST',
        description: 'Production scheduling agent endpoint',
        type: 'agent',
        requiresPayment: false,
      },
      {
        path: '/agent/quality',
        method: 'POST',
        description: 'Quality inspection agent endpoint',
        type: 'agent',
        requiresPayment: false,
      },
      {
        path: '/agent/po',
        method: 'POST',
        description: 'Purchase order submission agent endpoint',
        type: 'agent',
        requiresPayment: false,
      },
      {
        path: '/api/agent-card',
        method: 'GET',
        description: 'Get agent card',
        type: 'api',
        requiresPayment: false,
      },
    ],
    protocols: {
      discovery: ['well-known'],
      transport: ['http-rest'],
      negotiation: ['capability-card'],
      identity: ['local-keys'],
      payment: ['mock'],
      wallet: ['local-keypair'],
      trust: ['allowlist'],
      encryption: ['none'],
      resilience: ['retry'],
      observability: ['file-log'],
      orchestration: ['pipeline'],
    },
  };

  getCard(): AgentCard {
    return this.agentCard;
  }
}
