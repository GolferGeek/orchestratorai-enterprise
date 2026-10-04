/**
 * The labelled cases for the API's rubrics, run against the real decision
 * model. A measurement, not a gate: Clef misses a few cases by design of the
 * labels (see the effort notes), so misses are reported in the score and only
 * a case that could not run fails the script.
 *
 *   cd apps/api && DECISION_BASE_URL=http://gg-macstudio:11434 npm run decisions:cases
 *   ... npm run decisions:cases -- --model=clef-flash --rubric=invoice-po-match
 *
 * Without DECISION_BASE_URL it says so and exits without running anything.
 */
import * as path from 'node:path';
import { DecisionClient, DEFAULT_DECISION_MODEL, DEFAULT_DECISION_TIMEOUT_MS } from '../client';
import { runRubric } from '../rubric';
import { loadRubricDir } from '../rubric-files';
import { loadCaseSuites } from './case-suites';

async function main(): Promise<number> {
  const baseUrl = process.env.DECISION_BASE_URL;
  if (!baseUrl) {
    console.log('DECISION_BASE_URL is not set: skipping the live decision cases.');
    return 0;
  }
  const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const only = arg('rubric');
  const client = new DecisionClient({
    baseUrl,
    model: arg('model') ?? process.env.DECISION_MODEL ?? DEFAULT_DECISION_MODEL,
    apiKey: process.env.DECISION_API_KEY ?? '',
    timeoutMs: Number(process.env.DECISION_TIMEOUT_MS ?? DEFAULT_DECISION_TIMEOUT_MS),
  });
  const rubrics = loadRubricDir(path.join(__dirname, '..', 'rubrics'));
  const suites = loadCaseSuites(__dirname).filter((s) => !only || s.rubric === only);
  if (suites.length === 0) throw new Error(`no case suite for ${only}`);

  let total = 0;
  let missed = 0;
  let errors = 0;
  const started = Date.now();
  for (const suite of suites) {
    const rubric = rubrics.get(suite.rubric)!;
    console.log(`\n${rubric.name} v${rubric.version}`);
    for (const c of suite.cases) {
      total++;
      try {
        const r = await runRubric(client, rubric, c.state);
        const ok = c.expect.includes(r.decision);
        if (!ok) missed++;
        console.log(`  ${ok ? 'ok  ' : 'MISS'} ${c.name.padEnd(52)} ${r.decision.padEnd(6)} expected ${c.expect.join('|').padEnd(12)} (${r.reason}) [${r.model}]`);
      } catch (error) {
        errors++;
        console.log(`  ERR  ${c.name}: ${(error as Error).message}`);
      }
    }
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`\n${total - missed - errors}/${total} as labelled on ${client.model} (${missed} missed, ${errors} errors, ${seconds}s)`);
  return errors ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
