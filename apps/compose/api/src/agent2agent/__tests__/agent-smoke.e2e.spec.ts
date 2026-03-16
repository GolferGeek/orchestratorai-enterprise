/**
 * Agent Smoke E2E Tests
 *
 * Pure HTTP tests against the running API — no browser, no UI.
 * Authenticates once, fires ALL agent requests in parallel,
 * and validates responses. Async agents use SSE streams to
 * wait for completion.
 *
 * ENV-agnostic: doesn't care about LLM_PROVIDER, DB_PROVIDER, etc.
 * Just needs a running API and valid credentials.
 *
 * Usage:
 *   cd apps/api
 *   npx jest --testPathPattern agent-smoke.e2e --runInBand --forceExit
 *
 * Env vars:
 *   E2E_API_URL       - API base URL (default: http://localhost:6100)
 *   E2E_TEST_EMAIL    - Login email (default: golfergeek@orchestratorai.io)
 *   E2E_TEST_PASSWORD - Login password (default: GolferGeek123!)
 *   E2E_PROVIDER      - LLM provider for context (default: ollama)
 *   E2E_MODEL         - LLM model for context (default: ministral-3:3b)
 */

import axios, { AxiosInstance } from 'axios';
import { randomUUID } from 'crypto';
import { IncomingMessage } from 'http';
import { resolve } from 'path';
import { config as dotenvConfig } from 'dotenv';

// Load root .env first, then overlay .env.azure if E2E_AUTH_PROVIDER=azure_oidc
const rootDir = resolve(__dirname, '../../../../..');
dotenvConfig({ path: resolve(rootDir, '.env') });
if (process.env.E2E_AUTH_PROVIDER === 'azure_oidc') {
  dotenvConfig({ path: resolve(rootDir, '.env.azure'), override: true });
}

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

const API_URL = process.env.E2E_API_URL || 'http://localhost:6100';
const TEST_EMAIL = process.env.E2E_TEST_EMAIL || 'golfergeek@orchestratorai.io';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'GolferGeek123!';
const LLM_PROVIDER = process.env.E2E_PROVIDER || 'ollama';
const LLM_MODEL = process.env.E2E_MODEL || 'ministral-3:3b';

// Auth provider: supabase (default) or azure_oidc
const AUTH_PROVIDER = process.env.E2E_AUTH_PROVIDER || 'supabase';
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID;
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;

// ---------------------------------------------------------------------------
// Agent definitions
// ---------------------------------------------------------------------------

interface AgentDef {
  slug: string;
  type: string;
  org: string;
  mode: 'converse' | 'build';
  async: boolean;
  prompt: string;
  payload?: Record<string, unknown>;
  timeout: number;
  provider?: string;
  model?: string;
}

const CONVERSE_AGENTS: AgentDef[] = [
  {
    slug: 'general-assistant',
    type: 'context',
    org: 'global',
    mode: 'converse',
    async: false,
    prompt: 'Hello, what can you help me with?',
    timeout: 60_000,
  },
  {
    slug: 'legal-contracts-agent',
    type: 'rag-runner',
    org: 'legal',
    mode: 'converse',
    async: false,
    prompt: 'What are the key elements of a standard NDA?',
    timeout: 60_000,
    model: 'llama3.2:1b',
  },
  {
    slug: 'legal-policies-agent',
    type: 'rag-runner',
    org: 'legal',
    mode: 'converse',
    async: false,
    prompt: 'What is our confidentiality policy?',
    timeout: 60_000,
    model: 'llama3.2:1b',
  },
  {
    slug: 'legal-litigation-agent',
    type: 'rag-runner',
    org: 'legal',
    mode: 'converse',
    async: false,
    prompt: 'What are common litigation risks for SaaS companies?',
    timeout: 60_000,
    model: 'llama3.2:1b',
  },
  {
    slug: 'legal-estate-agent',
    type: 'rag-runner',
    org: 'legal',
    mode: 'converse',
    async: false,
    prompt: 'What are the basics of estate planning?',
    timeout: 60_000,
    model: 'llama3.2:1b',
  },
  {
    slug: 'legal-intake-agent',
    type: 'rag-runner',
    org: 'legal',
    mode: 'converse',
    async: false,
    prompt:
      'I need to start a new client intake. What information do you need?',
    timeout: 60_000,
    model: 'llama3.2:1b',
  },
  {
    slug: 'hr-assistant',
    type: 'rag-runner',
    org: 'human-resources',
    mode: 'converse',
    async: false,
    prompt: 'What is our onboarding process for new employees?',
    timeout: 60_000,
    model: 'llama3.2:1b',
  },
  {
    slug: 'legal-department',
    type: 'langgraph',
    org: 'legal',
    mode: 'converse',
    async: false,
    prompt: 'Summarize the key risks in a standard SaaS agreement.',
    timeout: 90_000,
  },
  {
    slug: 'cad-agent',
    type: 'langgraph',
    org: 'engineering',
    mode: 'converse',
    async: false,
    prompt: 'Describe a simple bracket design for mounting a sensor.',
    timeout: 90_000,
    provider: 'google',
    model: 'gemini-2.0-flash-lite',
  },
];

const BUILD_AGENTS: AgentDef[] = [
  {
    slug: 'marketing-swarm',
    type: 'langgraph',
    org: 'marketing',
    mode: 'build',
    async: true,
    prompt: 'Create a short social media post about AI productivity tools.',
    payload: {
      action: 'create',
      contentType: 'social_post',
      topic: 'AI Productivity Tools',
      audience: 'Tech professionals',
      tone: 'professional',
    },
    timeout: 120_000,
  },
  {
    slug: 'image-generator',
    type: 'media',
    org: 'global',
    mode: 'build',
    async: true,
    prompt: 'A futuristic office workspace with holographic displays.',
    payload: {
      action: 'create',
      mediaType: 'image',
    },
    timeout: 90_000,
  },
  {
    slug: 'infographic-agent',
    type: 'media',
    org: 'marketing',
    mode: 'build',
    async: true,
    prompt: 'Create an infographic about the benefits of AI automation.',
    payload: {
      action: 'create',
      mediaType: 'image',
    },
    timeout: 90_000,
  },
];

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let client: AxiosInstance;
let accessToken: string;
let userId: string;

function buildContext(agent: AgentDef, conversationId: string, taskId: string) {
  return {
    orgSlug: agent.org,
    userId,
    conversationId,
    taskId,
    planId: NIL_UUID,
    deliverableId: NIL_UUID,
    agentSlug: agent.slug,
    agentType: agent.type,
    provider: agent.provider ?? LLM_PROVIDER,
    model: agent.model ?? LLM_MODEL,
  };
}

async function createConversation(agent: AgentDef): Promise<string> {
  const res = await client.post('/agent-to-agent/conversations', {
    agentName: agent.slug,
    organization: agent.org,
  });
  return res.data.id;
}

/**
 * Connect to SSE stream for a task using axios with responseType: 'stream'.
 * Returns a promise that resolves when agent.completed or agent.failed is
 * received, or when the timeout expires.
 */
function connectSSE(
  agent: AgentDef,
  taskId: string,
  timeoutMs: number,
): Promise<{ completed: boolean; events: string[] }> {
  return new Promise((resolve) => {
    const events: string[] = [];
    let settled = false;

    const finish = (completed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ completed, events });
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    const url = `${API_URL}/agent-to-agent/${agent.org}/${agent.slug}/tasks/${taskId}/stream`;

    axios
      .get<IncomingMessage>(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseType: 'stream',
        timeout: timeoutMs,
        validateStatus: () => true,
      })
      .then((res) => {
        const stream = res.data;
        let buffer = '';

        stream.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (!data) continue;
            try {
              const parsed = JSON.parse(data);
              const eventType =
                parsed.event_type || parsed.hook_event_type || '';
              if (eventType) events.push(eventType);

              if (
                eventType === 'agent.completed' ||
                eventType === 'task.completed'
              ) {
                stream.destroy();
                finish(true);
                return;
              }
              if (eventType === 'agent.failed' || eventType === 'task.failed') {
                stream.destroy();
                finish(false);
                return;
              }
            } catch {
              // keepalive or non-JSON
            }
          }
        });

        stream.on('end', () => finish(events.length > 0));
        stream.on('error', () => finish(false));
      })
      .catch(() => finish(false));
  });
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

interface AgentResult {
  agent: AgentDef;
  status: 'pass' | 'fail' | 'error';
  httpStatus?: number;
  message: string;
  durationMs: number;
  sseEvents?: string[];
}

// ---------------------------------------------------------------------------
// Individual agent test runners
// ---------------------------------------------------------------------------

async function testConverseAgent(agent: AgentDef): Promise<AgentResult> {
  const start = Date.now();
  try {
    const conversationId = await createConversation(agent);
    const taskId = randomUUID();

    const request = {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'converse',
      params: {
        context: buildContext(agent, conversationId, taskId),
        mode: 'converse',
        userMessage: agent.prompt,
        messages: [],
        payload: { action: 'send' },
      },
    };

    const res = await client.post(
      `/agent-to-agent/${agent.org}/${agent.slug}/tasks`,
      request,
      { timeout: agent.timeout },
    );

    const duration = Date.now() - start;
    const body = res.data;

    // Accept 200 (sync complete) or 201 (task created with result)
    if (res.status !== 200 && res.status !== 201) {
      return {
        agent,
        status: 'fail',
        httpStatus: res.status,
        message: `HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`,
        durationMs: duration,
      };
    }

    // JSON-RPC envelope
    if (body.jsonrpc) {
      if (body.error) {
        return {
          agent,
          status: 'fail',
          httpStatus: res.status,
          message: `JSON-RPC error: ${body.error.message}`,
          durationMs: duration,
        };
      }

      const success = body.result?.success;
      const content = body.result?.payload?.content;
      const hasContent = contentIsNonEmpty(content);

      // Check if response indicates an internal error (success=false with reason)
      const reason = body.result?.payload?.metadata?.reason;
      if (!success && reason) {
        return {
          agent,
          status: 'fail',
          httpStatus: res.status,
          message: `Agent error: ${String(reason).slice(0, 150)}`,
          durationMs: duration,
        };
      }

      if (success && hasContent) {
        const size = describeContent(content);
        return {
          agent,
          status: 'pass',
          httpStatus: res.status,
          message: `OK (${size})`,
          durationMs: duration,
        };
      }

      return {
        agent,
        status: 'fail',
        httpStatus: res.status,
        message: `success=${success}, hasContent=${hasContent}`,
        durationMs: duration,
      };
    }

    // Legacy format
    if (body.success && body.payload) {
      return {
        agent,
        status: 'pass',
        httpStatus: res.status,
        message: 'OK (legacy format)',
        durationMs: duration,
      };
    }

    return {
      agent,
      status: 'fail',
      httpStatus: res.status,
      message: `Unexpected response: ${JSON.stringify(body).slice(0, 200)}`,
      durationMs: duration,
    };
  } catch (err) {
    return {
      agent,
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

async function testBuildAgent(agent: AgentDef): Promise<AgentResult> {
  const start = Date.now();
  try {
    const conversationId = await createConversation(agent);
    const taskId = randomUUID();

    // Connect SSE BEFORE sending the request (so we don't miss events)
    const ssePromise = connectSSE(agent, taskId, agent.timeout);

    const request = {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'build.execute',
      params: {
        context: buildContext(agent, conversationId, taskId),
        mode: 'build',
        userMessage: agent.prompt,
        messages: [],
        payload: agent.payload || { action: 'create' },
      },
    };

    const res = await client.post(
      `/agent-to-agent/${agent.org}/${agent.slug}/tasks/async`,
      request,
      { timeout: agent.timeout },
    );

    const body = res.data;

    // Accept 200, 201, or 202
    if (res.status !== 200 && res.status !== 201 && res.status !== 202) {
      return {
        agent,
        status: 'fail',
        httpStatus: res.status,
        message: `HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`,
        durationMs: Date.now() - start,
      };
    }

    // If 200/201, the agent may have completed synchronously
    if (res.status === 200 || res.status === 201) {
      const duration = Date.now() - start;
      const success = body.jsonrpc ? body.result?.success : body.success;
      const reason = body.jsonrpc
        ? body.result?.payload?.metadata?.reason
        : body.payload?.metadata?.reason;

      if (!success && reason) {
        return {
          agent,
          status: 'fail',
          httpStatus: res.status,
          message: `Agent error: ${String(reason).slice(0, 150)}`,
          durationMs: duration,
        };
      }

      return {
        agent,
        status: success ? 'pass' : 'fail',
        httpStatus: res.status,
        message: success ? 'OK (completed sync)' : `success=${success}`,
        durationMs: duration,
      };
    }

    // 202 — wait for SSE completion
    const sseResult = await ssePromise;
    const duration = Date.now() - start;

    if (sseResult.completed) {
      return {
        agent,
        status: 'pass',
        httpStatus: 202,
        message: `OK via SSE (${sseResult.events.length} events)`,
        durationMs: duration,
        sseEvents: sseResult.events,
      };
    }

    return {
      agent,
      status: 'fail',
      httpStatus: 202,
      message: `SSE timed out. Events: [${sseResult.events.join(', ')}]`,
      durationMs: duration,
      sseEvents: sseResult.events,
    };
  } catch (err) {
    return {
      agent,
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function contentIsNonEmpty(content: unknown): boolean {
  if (typeof content === 'string') return content.length > 0;
  if (typeof content === 'object' && content !== null)
    return Object.keys(content).length > 0;
  return false;
}

function describeContent(content: unknown): string {
  if (typeof content === 'string') return `${content.length} chars`;
  if (typeof content === 'object' && content !== null)
    return `${Object.keys(content).length} keys`;
  return String(typeof content);
}

// ---------------------------------------------------------------------------
// Summary printer
// ---------------------------------------------------------------------------

function printSummary(results: AgentResult[]) {
  const passed = results.filter((r) => r.status === 'pass');
  const failed = results.filter((r) => r.status === 'fail');
  const errors = results.filter((r) => r.status === 'error');

  console.log('\n' + '='.repeat(80));
  console.log('  AGENT SMOKE TEST RESULTS');
  console.log('='.repeat(80));

  for (const r of results) {
    const icon =
      r.status === 'pass' ? 'PASS' : r.status === 'fail' ? 'FAIL' : 'ERR ';
    const dur = `${(r.durationMs / 1000).toFixed(1)}s`;
    const httpLabel = r.httpStatus ? ` [${r.httpStatus}]` : '';
    console.log(
      `  ${icon}  ${r.agent.slug.padEnd(28)} ${r.agent.mode.padEnd(10)} ${dur.padStart(7)}${httpLabel}  ${r.message}`,
    );
  }

  console.log('-'.repeat(80));
  console.log(
    `  Total: ${results.length} | Pass: ${passed.length} | Fail: ${failed.length} | Error: ${errors.length}`,
  );
  console.log('='.repeat(80) + '\n');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Agent Smoke E2E Tests', () => {
  beforeAll(async () => {
    if (AUTH_PROVIDER === 'azure_oidc') {
      // Azure OIDC: client credentials flow
      if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET) {
        throw new Error(
          'Azure OIDC requires AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET',
        );
      }
      const tokenUrl = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`;
      const tokenRes = await axios.post(
        tokenUrl,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: AZURE_CLIENT_ID,
          client_secret: AZURE_CLIENT_SECRET,
          scope: `${AZURE_CLIENT_ID}/.default`,
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      accessToken = tokenRes.data.access_token;
      expect(accessToken).toBeDefined();
    } else {
      // Supabase: email/password login
      const loginRes = await axios.post(`${API_URL}/auth/login`, {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      });
      accessToken = loginRes.data.accessToken;
      expect(accessToken).toBeDefined();
    }

    // Create authenticated client
    client = axios.create({
      baseURL: API_URL,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      validateStatus: () => true,
    });

    // Get userId
    const meRes = await client.get('/auth/me');
    userId = meRes.data.id;
    expect(userId).toBeDefined();

    const authLabel =
      AUTH_PROVIDER === 'azure_oidc' ? 'Azure OIDC' : 'Supabase';
    console.log(`\n  Authenticated via ${authLabel} (${userId})`);
    console.log(`  API: ${API_URL}`);
    console.log(`  LLM: ${LLM_PROVIDER}/${LLM_MODEL}`);
    console.log(
      `  Agents: ${CONVERSE_AGENTS.length} converse + ${BUILD_AGENTS.length} build\n`,
    );
  }, 15_000);

  it('should run all agents in parallel and produce a summary', async () => {
    // Fire ALL agents in parallel
    const allPromises: Promise<AgentResult>[] = [
      ...CONVERSE_AGENTS.map((a) => testConverseAgent(a)),
      ...BUILD_AGENTS.map((a) => testBuildAgent(a)),
    ];

    const results = await Promise.all(allPromises);

    // Print summary
    printSummary(results);

    // Assertion: at least one agent must pass to confirm the system is alive
    const passed = results.filter((r) => r.status === 'pass');
    expect(passed.length).toBeGreaterThan(0);

    // Log warnings for errors
    for (const r of results) {
      if (r.status === 'error') {
        console.warn(`  WARNING: ${r.agent.slug} errored: ${r.message}`);
      }
    }
  }, 300_000); // 5 minute overall timeout
});
