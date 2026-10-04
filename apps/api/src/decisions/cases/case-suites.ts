import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from 'yaml';
import type { Decision } from '../rubric';

/** One labelled case: the rubric's inputs and the decisions a correct read may give. */
export interface DecisionCase {
  name: string;
  expect: Decision[];
  state: Record<string, unknown>;
}

export interface CaseSuite {
  rubric: string;
  cases: DecisionCase[];
}

/** cases/<rubric>.yaml, one suite per rubric. */
export function loadCaseSuites(dir: string): CaseSuite[] {
  return fs
    .readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .map((f) => {
      const suite = parse(fs.readFileSync(path.join(dir, f), 'utf8')) as CaseSuite;
      if (typeof suite.rubric !== 'string' || !Array.isArray(suite.cases) || suite.cases.length === 0) throw new Error(`${f}: needs a rubric and cases`);
      return suite;
    });
}
