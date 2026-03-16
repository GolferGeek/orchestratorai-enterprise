import * as fs from 'fs';
import * as path from 'path';

interface ManifestCheck {
  schema: string;
  table: string;
  minCount: number;
  description: string;
}

interface ProviderManifest {
  checks: ManifestCheck[];
  requiredAgentSlugs: string[];
}

interface SeedManifest {
  version: string;
  description: string;
  providers: Record<string, ProviderManifest>;
}

function fail(message: string): never {
  throw new Error(message);
}

function validateCheck(check: ManifestCheck, providerName: string, idx: number): void {
  if (!check.schema || check.schema.trim() === '') {
    fail(`providers.${providerName}.checks[${idx}].schema is required`);
  }
  if (!check.table || check.table.trim() === '') {
    fail(`providers.${providerName}.checks[${idx}].table is required`);
  }
  if (!Number.isInteger(check.minCount) || check.minCount < 0) {
    fail(
      `providers.${providerName}.checks[${idx}].minCount must be a non-negative integer`,
    );
  }
  if (!check.description || check.description.trim() === '') {
    fail(`providers.${providerName}.checks[${idx}].description is required`);
  }
}

function validateProviderManifest(
  provider: ProviderManifest,
  providerName: string,
): void {
  if (!Array.isArray(provider.checks)) {
    fail(`providers.${providerName}.checks must be an array`);
  }
  provider.checks.forEach((check, idx) =>
    validateCheck(check, providerName, idx),
  );

  if (!Array.isArray(provider.requiredAgentSlugs)) {
    fail(`providers.${providerName}.requiredAgentSlugs must be an array`);
  }
  provider.requiredAgentSlugs.forEach((slug, idx) => {
    if (!slug || slug.trim() === '') {
      fail(`providers.${providerName}.requiredAgentSlugs[${idx}] is empty`);
    }
  });
}

function run(): void {
  const manifestPath = process.env.MANIFEST_PATH
    ? process.env.MANIFEST_PATH.startsWith('/')
      ? process.env.MANIFEST_PATH
      : path.join(process.cwd(), process.env.MANIFEST_PATH)
    : path.join(process.cwd(), '../../scripts/init/seed-manifest.json');

  if (!fs.existsSync(manifestPath)) {
    fail(`Seed manifest not found: ${manifestPath}`);
  }

  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw) as SeedManifest;

  if (!manifest.version || manifest.version.trim() === '') {
    fail('manifest.version is required');
  }
  if (!manifest.description || manifest.description.trim() === '') {
    fail('manifest.description is required');
  }
  if (!manifest.providers || typeof manifest.providers !== 'object') {
    fail('manifest.providers is required');
  }

  const providerNames = Object.keys(manifest.providers);
  if (providerNames.length === 0) {
    fail('manifest.providers must contain at least one provider');
  }
  providerNames.forEach((providerName) => {
    const providerManifest = manifest.providers[providerName];
    if (!providerManifest) {
      fail(`providers.${providerName} is undefined`);
    }
    validateProviderManifest(providerManifest, providerName);
  });

  console.log('✅ Seed manifest is valid');
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Providers: ${providerNames.join(', ')}`);
}

try {
  run();
  process.exit(0);
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`❌ Seed manifest validation failed: ${message}`);
  process.exit(1);
}
