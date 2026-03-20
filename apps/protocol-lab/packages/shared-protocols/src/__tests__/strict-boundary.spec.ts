import {
  enableStrictBoundaryMode,
  disableStrictBoundaryMode,
  isStrictBoundaryMode,
  assertCrossAgentBoundary,
} from '../boundary/strict-boundary';

// Reset strict mode before each test to ensure isolation
beforeEach(() => {
  disableStrictBoundaryMode();
});

describe('strict-boundary', () => {
  it('strict mode: disabled by default', () => {
    expect(isStrictBoundaryMode()).toBe(false);
  });

  it('strict mode: can be enabled', () => {
    enableStrictBoundaryMode();
    expect(isStrictBoundaryMode()).toBe(true);
  });

  it('strict mode: same-agent call passes even when enabled', () => {
    enableStrictBoundaryMode();
    expect(() => assertCrossAgentBoundary('prairie-ridge', 'prairie-ridge')).not.toThrow();
  });

  it('strict mode: cross-agent call throws when enabled', () => {
    enableStrictBoundaryMode();
    expect(() => assertCrossAgentBoundary('buildwell', 'prairie-ridge')).toThrow(
      'Strict boundary violation: buildwell attempted in-process call to prairie-ridge',
    );
  });

  it('strict mode: cross-agent call passes when disabled', () => {
    // strict mode is disabled (reset in beforeEach)
    expect(() => assertCrossAgentBoundary('buildwell', 'prairie-ridge')).not.toThrow();
  });

  it('strict mode: can toggle on/off', () => {
    enableStrictBoundaryMode();
    expect(isStrictBoundaryMode()).toBe(true);

    disableStrictBoundaryMode();
    expect(isStrictBoundaryMode()).toBe(false);

    // Cross-agent call should pass after disabling
    expect(() => assertCrossAgentBoundary('apex-oem', 'buildwell')).not.toThrow();
  });
});
