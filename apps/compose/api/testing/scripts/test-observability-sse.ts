#!/usr/bin/env npx ts-node
/**
 * Observability SSE Validation Script
 *
 * Tests the full flow:
 * 1. Authenticate as admin user
 * 2. Connect to /observability/stream SSE endpoint
 * 3. Trigger an agent task (blog-post-writer BUILD)
 * 4. Verify observability events are received via SSE
 *
 * Run with:
 *   npx ts-node apps/api/testing/scripts/test-observability-sse.ts
 *
 * Or with environment variables:
 *   API_URL=http://localhost:6100 npx ts-node apps/api/testing/scripts/test-observability-sse.ts
 */

// eventsource v3 exports EventSource as a named export
import { EventSource } from 'eventsource';

const API_URL = process.env.API_URL;
if (!API_URL) {
  console.error('ERROR: API_URL environment variable is required');
  process.exit(1);
}
// Use admin user which has admin:audit permission for observability stream
// Env vars: SUPABASE_TEST_USER, SUPABASE_TEST_PASSWORD
const TEST_EMAIL = process.env.SUPABASE_TEST_USER || 'admin@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'Admin123!';
const ORG_SLUG = 'demo-org';
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

interface ObservabilityEvent {
  context?: {
    conversationId?: string;
    taskId?: string;
    userId?: string;
    agentSlug?: string;
    orgSlug?: string;
  };
  hook_event_type?: string;
  event_type?: string;
  status?: string;
  message?: string | null;
  progress?: number;
  step?: string;
  timestamp?: number;
  payload?: Record<string, unknown>;
}

// Collected events for analysis
const receivedEvents: ObservabilityEvent[] = [];
let currentTaskId: string | null = null;
let currentConversationId: string | null = null;

async function authenticate(): Promise<{ token: string; userId: string }> {
  console.log('\n🔐 Authenticating...');
  console.log(`   Email: ${TEST_EMAIL}`);

  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Authentication failed: ${response.status} - ${text}`);
  }

  const data = await response.json();
  if (!data.accessToken) {
    throw new Error('No access token in response');
  }

  // Extract userId from JWT sub claim
  let userId = '';
  try {
    const jwtParts = data.accessToken.split('.');
    if (jwtParts[1]) {
      const jwtPayload = JSON.parse(Buffer.from(jwtParts[1], 'base64').toString());
      userId = jwtPayload.sub;
    }
  } catch {
    throw new Error('Failed to extract userId from JWT');
  }

  console.log('   ✅ Authenticated successfully');
  console.log(`   User ID: ${userId}`);
  return { token: data.accessToken, userId };
}

function connectToObservabilityStream(token: string): Promise<EventSource> {
  return new Promise((resolve, reject) => {
    console.log('\n📡 Connecting to observability SSE stream...');
    console.log(`   URL: ${API_URL}/observability/stream`);

    const url = `${API_URL}/observability/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);

    const timeout = setTimeout(() => {
      es.close();
      reject(new Error('SSE connection timeout (10s)'));
    }, 10000);

    es.onopen = () => {
      clearTimeout(timeout);
      console.log('   ✅ SSE connection opened');
      resolve(es);
    };

    es.onerror = (error: Event) => {
      clearTimeout(timeout);
      console.error('   ❌ SSE connection error:', error);
      reject(new Error('SSE connection failed'));
    };

    es.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as ObservabilityEvent;
        const eventType = data.hook_event_type || data.event_type || 'unknown';

        // Skip connection confirmation
        if (eventType === 'connected') {
          console.log('   📨 Connection confirmed by server');
          return;
        }

        receivedEvents.push(data);

        // Log event with color coding
        const taskId = data.context?.taskId || 'no-task';
        const isOurTask = currentTaskId && taskId === currentTaskId;
        const prefix = isOurTask ? '   🎯' : '   📨';

        console.log(
          `${prefix} Event: ${eventType}` +
            ` | task: ${taskId.substring(0, 8)}...` +
            ` | progress: ${data.progress ?? '-'}` +
            ` | msg: ${(data.message || '').substring(0, 50)}`,
        );
      } catch (e) {
        console.log('   ⚠️  Failed to parse event:', event.data?.substring(0, 100));
      }
    };
  });
}

async function triggerAgentTask(token: string, userId: string): Promise<{ taskId: string; conversationId: string }> {
  console.log('\n🚀 Triggering agent task (blog-post-writer CONVERSE then BUILD)...');

  const agentSlug = 'blog-post-writer';

  // First, CONVERSE to get a conversation
  console.log('   Step 1: CONVERSE mode...');
  const converseResponse = await fetch(
    `${API_URL}/agent-to-agent/${ORG_SLUG}/${agentSlug}/tasks`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        userMessage: 'Write a very short test blog post about observability testing',
        mode: 'converse',
        // ExecutionContext - required by Phase 3.5
        context: {
          orgSlug: ORG_SLUG,
          agentSlug,
          agentType: 'context',
          userId,
          conversationId: NIL_UUID, // Will be created
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: 'anthropic',
          model: 'claude-3-5-haiku-20241022',
        },
        payload: {},
      }),
    },
  );

  if (!converseResponse.ok) {
    const text = await converseResponse.text();
    throw new Error(`CONVERSE failed: ${converseResponse.status} - ${text}`);
  }

  const converseData = await converseResponse.json();
  if (!converseData.success) {
    throw new Error(`CONVERSE returned failure: ${JSON.stringify(converseData)}`);
  }

  // Try multiple paths to find conversationId
  const conversationId =
    converseData.payload?.metadata?.streaming?.conversationId ||
    converseData.payload?.metadata?.conversationId ||
    converseData.payload?.content?.conversationId;

  if (!conversationId) {
    console.log('   ⚠️  Response structure:', JSON.stringify(converseData, null, 2).substring(0, 500));
    throw new Error('No conversationId in CONVERSE response');
  }

  console.log(`   ✅ CONVERSE complete, conversationId: ${conversationId}`);
  currentConversationId = conversationId;

  // Now BUILD
  console.log('   Step 2: BUILD mode...');
  const buildResponse = await fetch(
    `${API_URL}/agent-to-agent/${ORG_SLUG}/${agentSlug}/tasks`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        userMessage: 'Now build the blog post',
        mode: 'build',
        // ExecutionContext - required by Phase 3.5
        context: {
          orgSlug: ORG_SLUG,
          agentSlug,
          agentType: 'context',
          userId,
          conversationId, // Use the one from CONVERSE
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: 'anthropic',
          model: 'claude-3-5-haiku-20241022',
        },
        payload: {
          action: 'create',
        },
      }),
    },
  );

  if (!buildResponse.ok) {
    const text = await buildResponse.text();
    throw new Error(`BUILD failed: ${buildResponse.status} - ${text}`);
  }

  const buildData = await buildResponse.json();
  console.log(`   ✅ BUILD complete, success: ${buildData.success}`);

  // Extract taskId from response metadata
  const taskId =
    buildData.payload?.metadata?.taskId ||
    buildData.payload?.metadata?.streaming?.taskId ||
    'unknown';

  currentTaskId = taskId;

  return { taskId, conversationId };
}

function analyzeEvents(): void {
  console.log('\n📊 Analyzing received events...');
  console.log(`   Total events received: ${receivedEvents.length}`);

  if (receivedEvents.length === 0) {
    console.log('   ⚠️  No events received! Check:');
    console.log('      - Is the API server running?');
    console.log('      - Is ObservabilityEventsService.push() being called?');
    console.log('      - Is the SSE subscription working?');
    return;
  }

  // Group events by type
  const byType: Record<string, number> = {};
  for (const event of receivedEvents) {
    const type = event.hook_event_type || event.event_type || 'unknown';
    byType[type] = (byType[type] || 0) + 1;
  }

  console.log('\n   Events by type:');
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${type}: ${count}`);
  }

  // Check for our task's events
  if (currentConversationId) {
    const ourEvents = receivedEvents.filter(
      (e) => e.context?.conversationId === currentConversationId,
    );
    console.log(`\n   Events for our conversation (${currentConversationId.substring(0, 8)}...): ${ourEvents.length}`);

    if (ourEvents.length > 0) {
      console.log('   Our event types:');
      const ourTypes = [...new Set(ourEvents.map((e) => e.hook_event_type || e.event_type))];
      for (const type of ourTypes) {
        console.log(`      - ${type}`);
      }
    }
  }

  // Check for expected event types
  const expectedTypes = [
    'agent.started',
    'agent.progress',
    'agent.completed',
    'agent.stream.chunk',
    'agent.llm.started',
    'agent.llm.completed',
  ];
  const foundTypes = new Set(Object.keys(byType));

  console.log('\n   Expected event types check:');
  for (const expected of expectedTypes) {
    const found = foundTypes.has(expected);
    console.log(`      ${found ? '✅' : '❌'} ${expected}`);
  }
}

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' Observability SSE Validation Script');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`API URL: ${API_URL}`);

  let eventSource: EventSource | null = null;

  try {
    // Step 1: Authenticate
    const { token, userId } = await authenticate();

    // Step 2: Connect to SSE stream
    eventSource = await connectToObservabilityStream(token);

    // Step 3: Wait a moment for buffered events
    console.log('\n⏳ Waiting 2s for any buffered events...');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 4: Trigger agent task
    const { taskId, conversationId } = await triggerAgentTask(token, userId);
    console.log(`\n   Task triggered: ${taskId}`);
    console.log(`   Conversation: ${conversationId}`);

    // Step 5: Wait for events to arrive
    console.log('\n⏳ Waiting 5s for observability events...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Step 6: Analyze results
    analyzeEvents();

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(' Test Complete');
    console.log('═══════════════════════════════════════════════════════════');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    if (eventSource) {
      eventSource.close();
      console.log('\n🔌 SSE connection closed');
    }
  }
}

main();
