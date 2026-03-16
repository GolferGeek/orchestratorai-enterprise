import { PROTOCOL_PRESETS, PROTOCOL_SUITES, PROVIDER_DEPENDENCIES } from '../protocol-config.types';

describe('protocol-config suite metadata', () => {
  it('contains expected suite registry entries', () => {
    const suiteIds = PROTOCOL_SUITES.map((suite) => suite.id);
    expect(suiteIds).toEqual(expect.arrayContaining(['a2a', 'agntcy', 'commerce-acp', 'coinbase']));
  });

  it('contains expected provider dependency bundles', () => {
    const dependencyIds = PROVIDER_DEPENDENCIES.map((dependency) => dependency.id);
    expect(dependencyIds).toEqual(expect.arrayContaining([
      'a2a-core-bundle',
      'commerce-checkout-bundle',
      'coinbase-payment-bundle',
    ]));
  });

  it('exposes all protocol-suite presets', () => {
    const presetIds = PROTOCOL_PRESETS.map((preset) => preset.id);
    expect(presetIds).toEqual(expect.arrayContaining(['a2a-full', 'a2a-ap2', 'commerce-acp', 'agntcy-full']));
  });
});
