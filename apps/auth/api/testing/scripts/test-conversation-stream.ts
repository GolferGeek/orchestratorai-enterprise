#!/usr/bin/env npx ts-node
/**
 * Conversation Stream Validation Script
 *
 * Tests the conversation-specific streaming (what users see in the UI):
 * 1. Authenticate as a regular user
 * 2. CONVERSE to get a conversation context
 * 3. BUILD to trigger agent execution (returns taskId and streaming metadata)
 * 4. Get a stream token
 * 5. Connect to the task-specific SSE stream endpoint
 * 6. Verify stream chunks are received
 *
 * This is different from the admin observability stream (/observability/stream).
 * This tests the conversation stream (/agent-to-agent/.../tasks/:taskId/stream).
 *
 * Run with:
 *   npx ts-node apps/api/testing/scripts/test-conversation-stream.ts
 *
 * Or with environment variables:
 *   API_URL=http://localhost:6100 npx ts-node apps/api/testing/scripts/test-conversation-stream.ts
 */

import { EventSource } from 'eventsource';

const API_URL = process.env.API_URL;
if (!API_URL) {
  console.error('ERROR: API_URL environment variable is required');
  process.exit(1);
}
const TEST_EMAIL = process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'DemoUser123!';
const ORG_SLUG = 'demo-org';
const AGENT_SLUG = 'blog-post-writer';
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

interface StreamChunkEvent {
  context?: {
    conversationId?: string;
    taskId?: string;
    userId?: string;
    agentSlug?: string;
    orgSlug?: string;
  };
  streamId?: string;
  mode?: string;
  userMessage?: string;
  timestamp?: string;
  chunk?: {
    type?: string;
    content?: string;
    metadata?: {
      progress?: number;
      step?: string;
      message?: string;
      status?: string;
      hookEventType?: string;
    };
  };
}

interface StreamCompleteEvent {
  context?: {
    conversationId?: string;
    taskId?: string;
  };
  streamId?: string;
  mode?: string;
  type?: string;
  result?: unknown;
}

// Collected events for analysis
const receivedChunks: StreamChunkEvent[] = [];
const receivedCompletes: StreamCompleteEvent[] = [];
let streamConnected = false;
let streamCompleted = false;

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

async function converseToGetConversation(
  token: string,
  userId: string,
): Promise<{ conversationId: string }> {
  console.log('\n💬 Step 1: CONVERSE to establish conversation...');

  const response = await fetch(
    `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        userMessage: 'Write a very short test blog post about streaming',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: 'context',
          userId,
          conversationId: NIL_UUID,
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

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`CONVERSE failed: ${response.status} - ${text}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(`CONVERSE returned failure: ${JSON.stringify(data)}`);
  }

  // Extract conversationId from response
  const conversationId =
    data.payload?.metadata?.streaming?.conversationId ||
    data.payload?.metadata?.conversationId ||
    data.context?.conversationId;

  if (!conversationId || conversationId === NIL_UUID) {
    console.log('   ⚠️  Response structure:', JSON.stringify(data, null, 2).substring(0, 1000));
    throw new Error('No valid conversationId in CONVERSE response');
  }

  console.log(`   ✅ CONVERSE complete`);
  console.log(`   Conversation ID: ${conversationId}`);
  return { conversationId };
}

async function buildToGetStreamMetadata(
  token: string,
  userId: string,
  conversationId: string,
): Promise<{
  taskId: string;
  streamUrl: string;
  streamTokenUrl: string;
  streamId?: string;
}> {
  console.log('\n🏗️  Step 2: BUILD to get streaming metadata...');

  const response = await fetch(
    `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        userMessage: 'Now build the blog post',
        mode: 'build',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: 'context',
          userId,
          conversationId,
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

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`BUILD failed: ${response.status} - ${text}`);
  }

  const data = await response.json();
  console.log(`   ✅ BUILD complete, success: ${data.success}`);

  // Extract streaming metadata
  const metadata = data.payload?.metadata || {};
  const streaming = metadata.streaming || {};

  const taskId = data.context?.taskId || metadata.taskId || streaming.taskId;
  const streamUrl = streaming.streamUrl || metadata.streamUrl;
  const streamTokenUrl = streaming.streamTokenUrl || metadata.streamTokenUrl;
  const streamId = streaming.streamId || metadata.streamId;

  if (!taskId || taskId === NIL_UUID) {
    console.log('   ⚠️  Metadata:', JSON.stringify(metadata, null, 2));
    throw new Error('No valid taskId in BUILD response');
  }

  if (!streamUrl || !streamTokenUrl) {
    console.log('   ⚠️  Streaming metadata:', JSON.stringify(streaming, null, 2));
    console.log('   ⚠️  Full metadata:', JSON.stringify(metadata, null, 2));
    throw new Error('Missing streamUrl or streamTokenUrl in BUILD response');
  }

  console.log(`   Task ID: ${taskId}`);
  console.log(`   Stream URL: ${streamUrl}`);
  console.log(`   Stream Token URL: ${streamTokenUrl}`);
  if (streamId) {
    console.log(`   Stream ID: ${streamId}`);
  }

  return { taskId, streamUrl, streamTokenUrl, streamId };
}

async function getStreamToken(
  token: string,
  streamTokenUrl: string,
  streamId?: string,
): Promise<string> {
  console.log('\n🎫 Step 3: Getting stream token...');

  const response = await fetch(streamTokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(streamId ? { streamId } : {}),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get stream token: ${response.status} - ${text}`);
  }

  const data = await response.json();
  if (!data.token) {
    throw new Error('No token in stream token response');
  }

  console.log('   ✅ Stream token obtained');
  console.log(`   Expires at: ${data.expiresAt}`);
  return data.token;
}

function connectToConversationStream(
  streamUrl: string,
  streamToken: string,
  streamId?: string,
): Promise<EventSource> {
  return new Promise((resolve, reject) => {
    console.log('\n📡 Step 4: Connecting to conversation SSE stream...');

    const url = new URL(streamUrl);
    url.searchParams.set('token', streamToken);
    if (streamId) {
      url.searchParams.set('streamId', streamId);
    }

    const fullUrl = url.toString();
    console.log(`   URL: ${fullUrl.replace(/token=[^&]+/, 'token=HIDDEN')}`);

    const es = new EventSource(fullUrl);

    const timeout = setTimeout(() => {
      es.close();
      reject(new Error('SSE connection timeout (15s)'));
    }, 15000);

    es.onopen = () => {
      clearTimeout(timeout);
      streamConnected = true;
      console.log('   ✅ SSE connection opened');
      resolve(es);
    };

    es.onerror = (error: Event) => {
      if (!streamConnected) {
        clearTimeout(timeout);
        console.error('   ❌ SSE connection error:', error);
        reject(new Error('SSE connection failed'));
      } else {
        // Connection was open, this might be expected closure
        console.log('   ⚠️  SSE connection closed/error after open');
      }
    };

    // Listen for specific event types
    es.addEventListener('agent_stream_chunk', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as StreamChunkEvent;
        receivedChunks.push(data);

        const progress = data.chunk?.metadata?.progress ?? '-';
        const hookType = data.chunk?.metadata?.hookEventType ?? 'unknown';
        const content = (data.chunk?.content || '').substring(0, 50);

        console.log(
          `   📦 Chunk: ${hookType} | progress: ${progress} | ${content}`,
        );
      } catch (e) {
        console.log('   ⚠️  Failed to parse chunk:', event.data?.substring(0, 100));
      }
    });

    es.addEventListener('agent_stream_complete', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as StreamCompleteEvent;
        receivedCompletes.push(data);
        streamCompleted = true;
        console.log('   ✅ Stream complete event received');
      } catch (e) {
        console.log('   ⚠️  Failed to parse complete:', event.data?.substring(0, 100));
      }
    });

    es.addEventListener('agent_stream_error', (event: MessageEvent) => {
      console.error('   ❌ Stream error event:', event.data);
    });

    // Also listen for generic messages (for debugging)
    es.onmessage = (event: MessageEvent) => {
      // Skip keepalive comments
      if (event.data?.startsWith(':')) {
        return;
      }
      console.log(`   📨 Generic message: ${event.data?.substring(0, 100)}`);
    };
  });
}

function analyzeResults(): void {
  console.log('\n📊 Analyzing results...');
  console.log(`   Stream connected: ${streamConnected ? '✅' : '❌'}`);
  console.log(`   Stream completed: ${streamCompleted ? '✅' : '❌'}`);
  console.log(`   Total chunks received: ${receivedChunks.length}`);
  console.log(`   Total complete events: ${receivedCompletes.length}`);

  if (receivedChunks.length === 0) {
    console.log('\n   ⚠️  No chunks received! Check:');
    console.log('      - Is the API server emitting observability events?');
    console.log('      - Is the task-specific stream filtering correctly?');
    console.log('      - Is the stream connecting before the task completes?');
    return;
  }

  // Group chunks by hook event type
  const byHookType: Record<string, number> = {};
  for (const chunk of receivedChunks) {
    const type = chunk.chunk?.metadata?.hookEventType || 'unknown';
    byHookType[type] = (byHookType[type] || 0) + 1;
  }

  console.log('\n   Chunks by hook event type:');
  for (const [type, count] of Object.entries(byHookType).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${type}: ${count}`);
  }

  // Check for expected event types
  const expectedTypes = [
    'agent.started',
    'agent.progress',
    'agent.stream.chunk',
    'agent.llm.started',
    'agent.llm.completed',
  ];
  const foundTypes = new Set(Object.keys(byHookType));

  console.log('\n   Expected event types check:');
  for (const expected of expectedTypes) {
    const found = foundTypes.has(expected);
    console.log(`      ${found ? '✅' : '❌'} ${expected}`);
  }

  // Show progress timeline
  const progressEvents = receivedChunks
    .filter((c) => c.chunk?.metadata?.progress !== undefined)
    .map((c) => c.chunk!.metadata!.progress!);

  if (progressEvents.length > 0) {
    console.log(`\n   Progress timeline: ${progressEvents.join(' → ')}`);
  }
}

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' Conversation Stream Validation Script');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`API URL: ${API_URL}`);
  console.log(`Agent: ${ORG_SLUG}/${AGENT_SLUG}`);

  let eventSource: EventSource | null = null;

  try {
    // Step 1: Authenticate
    const { token, userId } = await authenticate();

    // Step 2: CONVERSE to get conversation
    const { conversationId } = await converseToGetConversation(token, userId);

    // Note: For a complete streaming test, we need to connect BEFORE calling BUILD.
    // However, we don't have the taskId yet. The solution is:
    // Option A: Connect to observability stream first (admin approach)
    // Option B: Start BUILD, then immediately connect to task stream (race condition)
    // Option C: Frontend approach - BUILD returns immediately, connect to stream, events replay

    // We'll use Option C - the backend replays recent events when you connect

    // Step 3: BUILD to get task and streaming metadata
    const { taskId, streamUrl, streamTokenUrl, streamId } = await buildToGetStreamMetadata(
      token,
      userId,
      conversationId,
    );

    // Step 4: Get stream token
    const streamToken = await getStreamToken(token, streamTokenUrl, streamId);

    // Step 5: Connect to stream (events should be replayed)
    eventSource = await connectToConversationStream(streamUrl, streamToken, streamId);

    // Step 6: Wait for events (or completion)
    console.log('\n⏳ Waiting for stream events (10s max or until complete)...');

    const startTime = Date.now();
    while (!streamCompleted && Date.now() - startTime < 10000) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Step 7: Analyze results
    analyzeResults();

    console.log('\n═══════════════════════════════════════════════════════════');
    if (streamCompleted && receivedChunks.length > 0) {
      console.log(' ✅ Test PASSED - Conversation streaming is working!');
    } else if (receivedChunks.length > 0) {
      console.log(' ⚠️  Test PARTIAL - Got chunks but no completion event');
    } else {
      console.log(' ❌ Test FAILED - No stream events received');
    }
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
