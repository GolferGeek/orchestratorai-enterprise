import type { CaseRecord } from '../monte-carlo-trial-simulator.types';

export const TEST_CASE_RECORD: CaseRecord = {
  matterId: 'matter-breach-2024-001',
  jurisdiction: 'Southern District of New York',
  courtLevel: 'federal-district',
  judge: 'Hon. Sarah Chen',
  caseType: 'Breach of Contract',
  claims: [
    {
      claimId: 'claim-1',
      description: 'Breach of software development agreement',
      elements: [
        'Valid contract existed',
        'Plaintiff performed its obligations',
        'Defendant failed to deliver software per specifications',
        'Plaintiff suffered damages',
      ],
      standardOfProof: 'preponderance of the evidence',
    },
    {
      claimId: 'claim-2',
      description: 'Breach of warranty of fitness for particular purpose',
      elements: [
        'Defendant knew particular purpose for which software was required',
        "Plaintiff relied on defendant's skill or judgment",
        'Software was not fit for that purpose',
      ],
      standardOfProof: 'preponderance of the evidence',
    },
    {
      claimId: 'claim-3',
      description: 'Fraudulent inducement',
      elements: [
        'Defendant made material misrepresentation',
        'Defendant knew it was false',
        'Plaintiff relied on misrepresentation',
        'Plaintiff suffered damages as a result',
      ],
      standardOfProof: 'clear and convincing evidence',
    },
  ],
  defenses: [
    {
      defenseId: 'defense-1',
      description:
        'Plaintiff materially breached contract first by changing specifications mid-development',
      type: 'affirmative',
    },
    {
      defenseId: 'defense-2',
      description:
        'Software delivered met contract specifications as written; any deficiency was due to vague requirements',
      type: 'negating',
    },
  ],
  evidence: [
    {
      evidenceId: 'ev-1',
      type: 'document',
      description: 'Signed software development agreement dated March 1, 2023',
      supportsClaims: ['claim-1', 'claim-2'],
      supportsDefenses: [],
      strength: 'strong',
      admissibilityRisk: 'low',
    },
    {
      evidenceId: 'ev-2',
      type: 'document',
      description:
        'Email chain showing defendant acknowledged 47 critical bugs in final delivery',
      supportsClaims: ['claim-1'],
      supportsDefenses: [],
      strength: 'strong',
      admissibilityRisk: 'low',
    },
    {
      evidenceId: 'ev-3',
      type: 'expert',
      description:
        'Expert report from software engineer assessing delivered code as 60% incomplete against specifications',
      supportsClaims: ['claim-1', 'claim-2'],
      supportsDefenses: [],
      strength: 'moderate',
      admissibilityRisk: 'medium',
    },
    {
      evidenceId: 'ev-4',
      type: 'document',
      description:
        'WhatsApp messages from defendant\'s CEO claiming plaintiff "would never catch" specification gaps',
      supportsClaims: ['claim-3'],
      supportsDefenses: [],
      strength: 'moderate',
      admissibilityRisk: 'high',
    },
    {
      evidenceId: 'ev-5',
      type: 'document',
      description:
        'Change order log showing plaintiff requested 8 scope changes during development',
      supportsClaims: [],
      supportsDefenses: ['defense-1'],
      strength: 'moderate',
      admissibilityRisk: 'high',
    },
  ],
  witnesses: [
    {
      witnessId: 'wit-1',
      name: 'Dr. James Patel',
      type: 'expert',
      side: 'plaintiff',
      credibilityFactors: [
        '20 years software engineering experience',
        'Published author on software quality',
      ],
      keyTestimony:
        'Delivered code was fundamentally non-functional and would require complete rewrite',
    },
    {
      witnessId: 'wit-2',
      name: 'Maria Gonzalez',
      type: 'party',
      side: 'plaintiff',
      credibilityFactors: [
        'CEO of plaintiff company',
        'Direct contract negotiator',
      ],
      keyTestimony:
        "Defendant's sales team explicitly promised full-featured CRM system by December 2023",
    },
    {
      witnessId: 'wit-3',
      name: 'Kevin Park',
      type: 'fact',
      side: 'defense',
      credibilityFactors: [
        'Lead developer who built the software',
        'Documented all change requests',
      ],
      keyTestimony:
        'Plaintiff changed scope 8 times, making original specifications obsolete',
    },
  ],
  damagesModel: [
    {
      type: 'compensatory',
      rangeMin: 2000000,
      rangeMax: 5000000,
      calculation:
        'Contract value ($2M) plus lost business opportunity ($0-$3M)',
    },
    {
      type: 'punitive',
      rangeMin: 0,
      rangeMax: 3000000,
      calculation: 'Up to 3x compensatory if fraudulent inducement proven',
    },
  ],
  simulationCount: 1,
  variationParameters: [
    'jury',
    'judge',
    'evidence-admissibility',
    'witness-credibility',
  ],
};
