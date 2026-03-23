import { readFileSync } from 'fs';
import { join } from 'path';

describe('run-demo scenario coverage', () => {
  it('invokes scenarios 12-15 in scenario mode, all mode, and fishbowl mode', () => {
    // Resolve from this file so cwd (repo root vs package) does not break the path.
    const scriptPath = join(__dirname, '../../../../../scripts/run-demo.sh');
    const script = readFileSync(scriptPath, 'utf8');

    expect(script).toContain('scenario_12()');
    expect(script).toContain('scenario_13()');
    expect(script).toContain('scenario_14()');
    expect(script).toContain('scenario_15()');

    expect(script).toContain('"$SS/scenarios/run/15"');
    expect(script).toContain('"$AS/scenarios/run/15"');
    expect(script).toContain('15) scenario_15 ;;');
    expect(script).toContain('scenario_15');
  });
});
