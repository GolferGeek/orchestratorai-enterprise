#!/usr/bin/env node
// Load each department org's knowledge base through the RAG API, so text
// extraction, chunking and embeddings go through the planes (not straight
// into the tables). Idempotent: a collection is created only if missing; a
// file is uploaded when the collection lacks it, and replaced when its
// content changed (the stored SHA-256 differs, or predates hashing); a
// document whose processing failed is removed and uploaded again.
// Any failure stops the script with the reason.
//
//   node scripts/seed-org-rag.mjs [https://enterprise.orchestratorai.io]
//
// Signs in as the admin persona (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD, or
// SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD from .env).
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const base = (process.argv[2] ?? 'https://enterprise.orchestratorai.io').replace(/\/$/, '');
const api = `${base}/api`;
const email = process.env.SEED_ADMIN_EMAIL ?? process.env.SMOKE_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD ?? process.env.SMOKE_ADMIN_PASSWORD;
if (!email || !password) throw new Error('Set SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD (or SMOKE_ADMIN_* in .env)');

const corpora = [
  { org: 'finance', name: 'finance-policy', files: dir('docs/RAG-filler/finance') },
  { org: 'corporate', name: 'corporate-board', files: dir('docs/RAG-filler/corporate') },
  { org: 'building', name: 'building-specs', files: dir('docs/RAG-filler/building') },
  // New Hire Onboarding reads its policy facts from this collection.
  { org: 'human-resources', name: 'hr-policy', files: dir('docs/RAG-filler/hr-documents') },
  {
    org: 'engineering',
    name: 'engineering-runbooks',
    files: [
      'docs/architecture.md',
      'docs/architecture/llm-boundary.md',
      'docs/architecture/workflows.md',
      'docs/deployment/README.md',
      'docs/deployment/studio.md',
      'docs/deployment/localhost-node.md',
      'docs/deployment/google-cloud.md',
      'docs/deployment/azure.md',
      'CODING.md',
    ],
  },
];

/** Every .md under a folder (recursively), by path relative to the repo root. */
function dir(relative) {
  return fs
    .readdirSync(path.join(root, relative), { recursive: true })
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => `${relative}/${f}`);
}

async function call(method, route, token, body, org) {
  const headers = { authorization: `Bearer ${token}`, ...(org ? { 'x-organization-slug': org } : {}) };
  if (body && !(body instanceof FormData)) headers['content-type'] = 'application/json';
  const response = await fetch(`${api}${route}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${route} -> ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const login = await fetch(`${api}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (!login.ok) throw new Error(`Sign-in failed: ${login.status}`);
const { accessToken } = await login.json();

for (const corpus of corpora) {
  const collections = await call('GET', `/rag/collections?orgSlug=${corpus.org}`, accessToken, undefined, corpus.org);
  let collection = collections.collections.find((c) => c.slug === corpus.name);
  if (!collection) {
    collection = await call('POST', '/rag/collections', accessToken, { name: corpus.name, orgSlug: corpus.org }, corpus.org);
    console.log(`created ${corpus.org}/${collection.slug}`);
  }
  if (collection.slug !== corpus.name) throw new Error(`Collection "${corpus.name}" got slug "${collection.slug}"`);
  const existing = await call('GET', `/rag/collections/${collection.id}/documents`, accessToken, undefined, corpus.org);
  // A document whose processing failed has no chunks: remove it and upload again.
  for (const failed of existing.documents.filter((d) => d.status !== 'completed')) {
    await call('DELETE', `/rag/collections/${collection.id}/documents/${failed.id}`, accessToken, undefined, corpus.org);
    console.log(`  removed ${failed.filename} (${failed.status})`);
  }
  const have = new Map(existing.documents.filter((d) => d.status === 'completed').map((d) => [d.filename, d]));
  for (const file of corpus.files) {
    const filename = path.basename(file);
    const content = fs.readFileSync(path.join(root, file));
    const stored = have.get(filename);
    if (stored && stored.fileHash === createHash('sha256').update(content).digest('hex')) continue;
    if (stored) {
      await call('DELETE', `/rag/collections/${collection.id}/documents/${stored.id}`, accessToken, undefined, corpus.org);
      console.log(`  replacing ${filename} (${stored.fileHash ? 'changed' : 'no hash yet'})`);
    }
    const form = new FormData();
    form.append('file', new Blob([content], { type: 'text/markdown' }), filename);
    const uploaded = await call('POST', `/rag/collections/${collection.id}/documents`, accessToken, form, corpus.org);
    if (uploaded.processingResult?.status !== 'completed') {
      throw new Error(`${filename}: processing ${uploaded.processingResult?.status}: ${uploaded.processingResult?.error ?? ''}`);
    }
    console.log(`  ${corpus.org}/${corpus.name} <- ${filename} (${uploaded.processingResult.chunkCount} chunks)`);
  }
  console.log(`${corpus.org}/${corpus.name}: ${corpus.files.length} file(s) in place`);
}
