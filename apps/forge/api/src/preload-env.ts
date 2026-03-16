/**
 * Load .env and .env.secrets before any other modules. Provider modules (DatabaseModule,
 * StorageModule, etc.) read process.env at import time, so we must load env before
 * AppModule is imported.
 *
 * Load order:
 * 1. .env (infrastructure: provider selectors, ports, URLs)
 * 2. .env.secrets (credentials: API keys, passwords) - optional, overrides .env
 *
 * Uses __dirname for reliable path resolution from dist/ output.
 */
import * as dotenv from 'dotenv';
import { join } from 'path';
import { existsSync } from 'fs';

const projectRoot = join(__dirname, '../../../../'); // from dist/: ../ = src, ../../ = api, ../../../ = forge, ../../../../ = monorepo root

const baseEnvPath = process.env.ENV_FILE
  ? process.env.ENV_FILE.startsWith('/')
    ? process.env.ENV_FILE
    : join(process.cwd(), process.env.ENV_FILE)
  : join(projectRoot, '.env');

const secretsEnvPath = join(projectRoot, '.env.secrets');

// Load base config
if (existsSync(baseEnvPath)) {
  dotenv.config({ path: baseEnvPath, override: true });
}

// Load secrets (overrides base values)
if (existsSync(secretsEnvPath)) {
  dotenv.config({ path: secretsEnvPath, override: true });
}
