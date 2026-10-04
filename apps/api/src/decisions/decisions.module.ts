import { join } from 'node:path';
import { Global, Logger, Module } from '@nestjs/common';
import { CONFIG_PROVIDER_SERVICE, type ConfigProvider } from '@orchestratorai/planes/config';
import { DecisionClient, DEFAULT_DECISION_MODEL, DEFAULT_DECISION_TIMEOUT_MS } from './client';
import { DecisionsService } from './decisions.service';
import { loadRubricDir } from './rubric-files';

/**
 * Where the rubric YAML is at runtime. Webpack bundles the API into
 * dist/main.js (__dirname is dist), and nest-cli.json copies
 * src/decisions/rubrics to dist/decisions/rubrics.
 */
export const RUNTIME_RUBRIC_DIR = join(__dirname, 'decisions', 'rubrics');

/**
 * Typed decisions on the decision model (Clef on Ollama today; hosted Jev
 * later, by configuration). Required: workflows gate on its verdicts, so a
 * missing DECISION_BASE_URL or an unreadable rubric stops the API at boot
 * rather than letting a step run unchecked.
 *
 *   DECISION_BASE_URL   required, e.g. http://host.docker.internal:11434
 *   DECISION_MODEL      default clef
 *   DECISION_API_KEY    secret, sent as a Bearer token when set (Ollama needs none)
 *   DECISION_TIMEOUT_MS default 120000 (a cold Clef load takes tens of seconds)
 */
@Global()
@Module({
  providers: [
    {
      provide: DecisionsService,
      inject: [CONFIG_PROVIDER_SERVICE],
      useFactory: async (config: ConfigProvider) => {
        const client = new DecisionClient({
          baseUrl: config.getRequired('DECISION_BASE_URL'),
          model: config.getOptional('DECISION_MODEL', DEFAULT_DECISION_MODEL),
          apiKey: await config.getSecretOptional('DECISION_API_KEY', ''),
          timeoutMs: config.getNumber('DECISION_TIMEOUT_MS', DEFAULT_DECISION_TIMEOUT_MS),
        });
        const rubrics = loadRubricDir(RUNTIME_RUBRIC_DIR);
        new Logger('DecisionsModule').log(`${rubrics.size} rubrics on ${client.model} at ${client.baseUrl}`);
        return new DecisionsService(client, rubrics);
      },
    },
  ],
  exports: [DecisionsService],
})
export class DecisionsModule {}
