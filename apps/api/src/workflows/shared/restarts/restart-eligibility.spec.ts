import { restartEligibility } from './restart-eligibility';

const points = { assess: { resumeAt: 'aggregate' } };

describe('restart eligibility', () => {
  it('allows a completed step with a restart point of a finished run', () => {
    expect(restartEligibility({ status: 'completed' }, { slug: 'assess', status: 'completed' }, points)).toEqual({
      eligible: true,
      reason: null,
    });
    expect(restartEligibility({ status: 'failed' }, { slug: 'assess', status: 'completed_partial' }, points).eligible).toBe(true);
  });

  it('refuses a run still going, a step that did not complete, and a step without a point', () => {
    expect(restartEligibility({ status: 'awaiting_review' }, { slug: 'assess', status: 'completed' }, points).reason).toBe(
      'The run is awaiting review; restart it once it has finished.',
    );
    expect(restartEligibility({ status: 'failed' }, { slug: 'assess', status: 'failed' }, points).reason).toContain('failed');
    expect(restartEligibility({ status: 'completed' }, { slug: 'summary', status: 'completed' }, points).eligible).toBe(false);
  });
});
