import { Injectable } from '@nestjs/common';
import { AgentCard } from '@agent-communication/shared-types';

@Injectable()
export class AgentCardService {
  private readonly agentCard: AgentCard = {
    id: 'prairie-ridge-app',
    name: 'Prairie Ridge Credit Farm Credit Ecosystem',
    description: 'Farm Credit System shared services, lending association, and funding bank fishbowl',
    url: `http://localhost:${process.env.PROTOCOL_LAB_PRAIRIE_RIDGE_PORT ?? '5407'}`,
    version: '0.1.0',
    capabilities: [
      {
        id: 'compliance-checking',
        name: 'Compliance Checking',
        description: 'Validate loan applications and transactions against Farm Credit Act regulations',
      },
      {
        id: 'helpdesk',
        name: 'Helpdesk',
        description: 'Answer policy, procedure, and regulatory questions for member associations',
      },
      {
        id: 'reporting',
        name: 'Reporting',
        description: 'Generate portfolio, exposure, and regulatory reports across the system',
      },
      {
        id: 'loan-submission',
        name: 'Loan Submission',
        description: 'Submit and track loan applications through the Farm Credit funding pipeline',
      },
      {
        id: 'oversight-review',
        name: 'Oversight Review',
        description: 'Conduct examinations, safety-and-soundness reviews, and funding approvals',
      },
    ],
    endpoints: [
      {
        path: '/agent/compliance',
        method: 'POST',
        description: 'Check compliance for a loan or transaction',
        type: 'agent',
        requiresPayment: false,
      },
      {
        path: '/agent/helpdesk',
        method: 'POST',
        description: 'Answer helpdesk questions',
        type: 'agent',
        requiresPayment: false,
      },
      {
        path: '/agent/report',
        method: 'POST',
        description: 'Generate a portfolio or regulatory report',
        type: 'agent',
        requiresPayment: false,
      },
      {
        path: '/agent/loan',
        method: 'POST',
        description: 'Submit a loan application',
        type: 'agent',
        requiresPayment: false,
      },
      {
        path: '/agent/oversight',
        method: 'POST',
        description: 'Request oversight review or funding approval',
        type: 'agent',
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

  getAgentCard(): AgentCard {
    return this.agentCard;
  }
}
