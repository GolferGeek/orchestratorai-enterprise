#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const acceptedFindings = new Map([
  [
    'gaxios',
    {
      nodes: ['node_modules/gaxios'],
      reason:
        'Accepted until a client enables Vertex AI or the upstream @google-cloud/vertexai dependency chain ships a clean update.',
    },
  ],
  [
    'uuid',
    {
      nodes: ['node_modules/gaxios/node_modules/uuid'],
      reason:
        'Accepted until a client enables Vertex AI or the upstream @google-cloud/vertexai dependency chain ships a clean update.',
    },
  ],
]);

const result = spawnSync('npm', ['audit', '--json'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

let report;
try {
  report = JSON.parse(result.stdout || '{}');
} catch (error) {
  console.error('Failed to parse npm audit JSON output.');
  if (result.stdout) {
    console.error(result.stdout);
  }
  if (result.stderr) {
    console.error(result.stderr);
  }
  process.exit(1);
}

const vulnerabilities = Object.values(report.vulnerabilities ?? {});
const unexpected = vulnerabilities.filter((finding) => {
  const accepted = acceptedFindings.get(finding.name);
  if (!accepted) {
    return true;
  }
  const nodes = finding.nodes ?? [];
  return (
    nodes.length !== accepted.nodes.length ||
    nodes.some((node) => !accepted.nodes.includes(node))
  );
});

if (unexpected.length > 0) {
  console.error('npm audit found unaccepted vulnerabilities:');
  for (const finding of unexpected) {
    console.error(`- ${finding.name}@${finding.range} (${finding.severity})`);
  }
  process.exit(1);
}

if (vulnerabilities.length > 0) {
  console.warn('npm audit findings are limited to accepted risks:');
  for (const finding of vulnerabilities) {
    const accepted = acceptedFindings.get(finding.name);
    console.warn(`- ${finding.name}@${finding.range}: ${accepted.reason}`);
  }
}

console.log('npm audit accepted-risk gate passed.');
