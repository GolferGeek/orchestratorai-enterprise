/**
 * Test fixtures for ReviewProtocol.
 *
 * Used in node specs and graph spec to avoid repeating protocol setup.
 */
import type { ReviewProtocol } from '../discovery-review.types';

export const fixtureProtocol: ReviewProtocol = {
  matterId: 'matter-001',
  matterName: 'Acme Corp v. Globex Inc.',
  relevanceCriteria: {
    claims: ['breach of contract', 'trade secret misappropriation'],
    dateRange: { start: '2022-01-01', end: '2024-12-31' },
    keyParties: ['Acme Corp', 'Globex Inc', 'John Smith'],
    keyTopics: ['product roadmap', 'pricing', 'customer data'],
    exclusions: ['marketing newsletters', 'press releases'],
  },
  privilegeHolders: {
    attorneys: ['Jane Doe', 'Robert Brown'],
    firms: ['Doe & Associates LLP', 'Brown Legal Group'],
    inHouseCounsel: ['Alice Chen'],
  },
  issueTags: [
    {
      tagId: 'trade-secret',
      tagName: 'Trade Secret',
      description: 'Documents relating to proprietary technology or know-how',
    },
    {
      tagId: 'pricing',
      tagName: 'Pricing',
      description: 'Documents discussing pricing strategy or specific prices',
    },
    {
      tagId: 'customer-data',
      tagName: 'Customer Data',
      description: 'Documents containing customer lists or contact information',
    },
  ],
  batchSize: 50,
  confidenceThreshold: 0.7,
  privilegeReviewRequired: true,
};

export const fixtureMinimalProtocol: ReviewProtocol = {
  matterId: 'matter-002',
  matterName: 'Test Matter',
  relevanceCriteria: {
    claims: ['negligence'],
    keyParties: ['Plaintiff', 'Defendant'],
    keyTopics: ['incident'],
  },
  privilegeHolders: {
    attorneys: ['Attorney A'],
    firms: [],
    inHouseCounsel: [],
  },
  issueTags: [],
  batchSize: 50,
  confidenceThreshold: 0.7,
  privilegeReviewRequired: true,
};

/** Protocol missing required fields — used to test protocol validation. */
export const fixtureInvalidProtocol = {
  matterId: '',
  matterName: '',
  relevanceCriteria: {
    claims: [], // empty claims — fails validation
    keyParties: [], // empty parties — fails validation
    keyTopics: [],
  },
  privilegeHolders: {
    attorneys: [], // empty — fails validation
    firms: [],
    inHouseCounsel: [],
  },
  issueTags: [],
  batchSize: 50,
  confidenceThreshold: 0.7,
  privilegeReviewRequired: true,
} as unknown as ReviewProtocol;
