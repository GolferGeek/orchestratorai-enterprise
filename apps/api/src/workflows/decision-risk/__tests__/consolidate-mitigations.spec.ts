import { Logger } from '@nestjs/common';
import { applyConsolidation, createConsolidateMitigationsNode } from '../nodes/consolidate-mitigations.node';
import type { DecisionRiskState, Mitigation } from '../decision-risk.state';

const mitigation = (dimensionSlug: string): Mitigation => ({
  assessmentId: `a-${dimensionSlug}`,
  dimensionSlug,
  proposal: 'Engage German legal counsel.',
  rationale: 'Local law.',
  effort: 'medium',
  residualScore: 40,
});

describe('mitigation consolidation', () => {
  const mitigations = [mitigation('legal'), mitigation('regulatory')];

  it('rewrites the wording and keeps each mitigation otherwise as proposed', () => {
    const out = applyConsolidation(mitigations, {
      proposals: [
        { dimension: 'regulatory', proposal: ' Covered by the legal mitigation; also file the works-council notice. ' },
        { dimension: 'legal', proposal: 'Engage German legal counsel.' },
      ],
    });
    expect(out).toEqual([
      mitigations[0],
      { ...mitigations[1], proposal: 'Covered by the legal mitigation; also file the works-council notice.' },
    ]);
  });

  it('refuses a missing, unknown, repeated or empty dimension', () => {
    expect(() => applyConsolidation(mitigations, { proposals: [{ dimension: 'legal', proposal: 'x' }] })).toThrow(/missing: regulatory/);
    expect(() => applyConsolidation(mitigations, { proposals: [{ dimension: 'legal', proposal: 'x' }, { dimension: 'regulatory', proposal: 'y' }, { dimension: 'people', proposal: 'z' }] })).toThrow(/unknown: people/);
    expect(() => applyConsolidation(mitigations, { proposals: [{ dimension: 'legal', proposal: 'x' }, { dimension: 'legal', proposal: 'y' }] })).toThrow(/'legal' twice/);
    expect(() => applyConsolidation(mitigations, { proposals: [{ dimension: 'legal', proposal: 'x' }, { dimension: 'regulatory', proposal: '  ' }] })).toThrow(/empty proposal for 'regulatory'/);
  });

  it('does not call a model for a single mitigation', async () => {
    const units = { runSolo: jest.fn() };
    const node = createConsolidateMitigationsNode({ units: units as never, logger: new Logger('test') });
    expect(await node({ mitigations: [mitigation('legal')] } as unknown as DecisionRiskState, {})).toEqual({});
    expect(units.runSolo).not.toHaveBeenCalled();
  });
});
