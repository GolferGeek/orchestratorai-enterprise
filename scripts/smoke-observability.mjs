// See smoke-observability.sh. Every check must pass; the first miss exits 1.
const env = (key) => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is required`);
  return value;
};
const API = env('API_URL');
const conversationId = env('SMOKE_CONVERSATION_ID');
const tag = env('SMOKE_TAG');
const started = Date.now();

function fail(message) {
  console.error(`Observability smoke FAILED: ${message}`);
  process.exit(1);
}

async function json(response, what) {
  if (!response.ok) fail(`${what} returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

const login = await json(
  await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: env('SMOKE_ADMIN_EMAIL'), password: env('SMOKE_ADMIN_PASSWORD') }),
  }),
  'login',
);
const token = login.accessToken ?? login.access_token;
if (!token) fail('login returned no access token');
const userId = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-organization-slug': '*' };

// 1. Open the live admin stream and collect this conversation's events.
const { token: streamToken } = await json(
  await fetch(`${API}/admin/observability/stream-token`, { method: 'POST', headers }),
  'admin stream token',
);
const abort = new AbortController();
const stream = await fetch(`${API}/admin/observability/stream?token=${encodeURIComponent(streamToken)}`, {
  signal: abort.signal,
});
if (!stream.ok) fail(`admin stream returned ${stream.status}`);
const live = [];
const reading = (async () => {
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read().catch(() => ({ done: true }));
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      if (!frame.startsWith('data: ')) continue;
      const event = JSON.parse(frame.slice(6));
      if (event.context?.conversationId === conversationId && (event.timestamp ?? 0) >= started) {
        live.push(event.hook_event_type);
      }
    }
  }
})();
await new Promise((resolve) => setTimeout(resolve, 1000));

// 2. One small call on the default model, in the smoke conversation.
const generated = await json(
  await fetch(`${API}/llm/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      systemPrompt: 'Answer with the single word: ok',
      userPrompt: 'ok?',
      context: {
        orgSlug: '*',
        userId,
        conversationId,
        agentSlug: 'deploy-smoke',
        agentType: 'smoke',
        provider: env('SMOKE_PROVIDER'),
        model: env('SMOKE_MODEL'),
      },
      options: { callerName: tag, maxTokens: 5 },
    }),
  }),
  'LLM call',
);
const requestId = generated.metadata?.requestId;
if (!requestId) fail('the LLM call returned no request id');

// 3. Live stream: started and completed arrived as they fired.
for (let i = 0; i < 20 && !(live.includes('agent.llm.started') && live.includes('agent.llm.completed')); i++) {
  await new Promise((resolve) => setTimeout(resolve, 500));
}
abort.abort();
await reading;
if (!live.includes('agent.llm.started') || !live.includes('agent.llm.completed')) {
  fail(`live admin stream saw ${JSON.stringify(live)} for the call, not started and completed`);
}

// 4. Usage list: the row with this exact request id.
let usageRow;
for (let i = 0; i < 10 && !usageRow; i++) {
  const rows = await json(
    await fetch(`${API}/admin/llm/usage/list?conversationId=${conversationId}&limit=20`, { headers }),
    'usage list',
  );
  usageRow = rows.find((row) => row.runId === requestId);
  if (!usageRow) await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!usageRow) fail(`no llm_usage row with run_id ${requestId} in the admin usage list`);

// 5. Event log: the stored completed event.
let logged;
for (let i = 0; i < 10 && !logged; i++) {
  const events = await json(
    await fetch(`${API}/admin/observability/events?search=agent.llm.completed&limit=50`, { headers }),
    'event log',
  );
  logged = events.find(
    (event) => event.conversationId === conversationId && Date.parse(event.occurredAt) >= started - 1000,
  );
  if (!logged) await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!logged) fail('the admin event log has no agent.llm.completed event for the call');

console.log(
  `Observability smoke passed: live stream (${live.join(', ')}), usage row ${requestId} (${usageRow.providerName}/${usageRow.modelName}), event log ${logged.id}`,
);
