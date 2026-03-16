import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface DemoStep {
  id: string;
  title: string;
  narration: string;
  fromAgent?: string;
  toAgent?: string;
  protocol?: string;
  action: string;
  highlight?: string;
  duration: number;
}

export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  steps: DemoStep[];
  protocolsUsed: string[];
}

const SCENARIOS: DemoScenario[] = [
  {
    id: 'basic-discovery',
    name: 'Basic Discovery & Query',
    description: 'Discover agents via .well-known endpoints and route a research request.',
    protocolsUsed: ['discovery', 'transport', 'observability'],
    steps: [
      {
        id: 'bd-1',
        title: 'Protocol API Starts',
        narration: 'The Protocol API boots up and begins scanning for agents via .well-known/agent.json endpoints on configured hosts.',
        action: 'protocol-api-start',
        duration: 3000,
      },
      {
        id: 'bd-2',
        title: 'ResearchHub Registers',
        narration: 'ResearchHub is discovered at localhost:4001/.well-known/agent.json. It advertises capabilities: research-analysis, category-scanning, narrative-generation.',
        fromAgent: 'ResearchHub',
        toAgent: 'Protocol API',
        protocol: 'discovery',
        action: 'agent-register',
        duration: 3000,
      },
      {
        id: 'bd-3',
        title: 'MarketPulse Registers',
        narration: 'MarketPulse is discovered at localhost:4002/.well-known/agent.json. It advertises capabilities: trend-detection, feed-aggregation, signal-scoring.',
        fromAgent: 'MarketPulse',
        toAgent: 'Protocol API',
        protocol: 'discovery',
        action: 'agent-register',
        duration: 3000,
      },
      {
        id: 'bd-4',
        title: 'User Requests Analysis',
        narration: 'A user submits a research analysis request: "Analyze the current state of AI agent protocols." The Protocol API receives it as a JSON-RPC 2.0 message.',
        action: 'user-request',
        duration: 3500,
      },
      {
        id: 'bd-5',
        title: 'Route to ResearchHub',
        narration: 'The Protocol API matches the request against registered capabilities. ResearchHub\'s "research-analysis" capability is the best match. The request is forwarded via HTTP REST transport.',
        fromAgent: 'Protocol API',
        toAgent: 'ResearchHub',
        protocol: 'transport',
        action: 'route-request',
        duration: 3000,
      },
      {
        id: 'bd-6',
        title: 'Response Logged',
        narration: 'ResearchHub returns a structured analysis. The full request/response cycle is captured in the observability log with timing, token usage, and routing metadata.',
        fromAgent: 'ResearchHub',
        toAgent: 'Protocol API',
        protocol: 'observability',
        action: 'log-response',
        duration: 3000,
      },
    ],
  },
  {
    id: 'paid-analysis',
    name: 'Paid Analysis Request',
    description: 'A premium research request triggers the x402 payment flow with on-chain verification.',
    protocolsUsed: ['discovery', 'negotiation', 'payment', 'transport'],
    steps: [
      {
        id: 'pa-1',
        title: 'ContentForge Needs Data',
        narration: 'ContentForge is generating a report but needs deep research data from ResearchHub\'s premium tier.',
        fromAgent: 'ContentForge',
        action: 'initiate-request',
        duration: 2500,
      },
      {
        id: 'pa-2',
        title: 'Discover ResearchHub',
        narration: 'ContentForge queries the Protocol API for agents with "research-analysis" capability. ResearchHub is returned as the best match.',
        fromAgent: 'ContentForge',
        toAgent: 'Protocol API',
        protocol: 'discovery',
        action: 'discover-agent',
        duration: 3000,
      },
      {
        id: 'pa-3',
        title: 'Negotiate Capabilities',
        narration: 'ContentForge requests ResearchHub\'s capability card. The card shows "deep-analysis" requires payment: 0.50 USDC per request.',
        fromAgent: 'ContentForge',
        toAgent: 'ResearchHub',
        protocol: 'negotiation',
        action: 'capability-negotiation',
        duration: 3000,
      },
      {
        id: 'pa-4',
        title: 'HTTP 402 Payment Required',
        narration: 'ContentForge sends the deep-analysis request. ResearchHub responds with HTTP 402 and an x402 payment header specifying amount, currency, and payment address.',
        fromAgent: 'ResearchHub',
        toAgent: 'ContentForge',
        protocol: 'payment',
        action: 'payment-required',
        duration: 3500,
      },
      {
        id: 'pa-5',
        title: 'Create Invoice',
        narration: 'The x402 payment flow begins. An invoice is created: 0.50 USDC to ResearchHub\'s wallet address, with a 5-minute expiry window.',
        protocol: 'payment',
        action: 'create-invoice',
        duration: 3000,
      },
      {
        id: 'pa-6',
        title: 'ContentForge Pays',
        narration: 'ContentForge\'s wallet signs and submits the USDC payment transaction to the blockchain. Transaction hash is generated.',
        fromAgent: 'ContentForge',
        protocol: 'payment',
        action: 'submit-payment',
        duration: 3000,
      },
      {
        id: 'pa-7',
        title: 'Payment Verified',
        narration: 'The payment provider verifies the transaction on-chain. Confirmation received: 0.50 USDC transferred successfully. Invoice marked as settled.',
        protocol: 'payment',
        action: 'verify-payment',
        duration: 3000,
      },
      {
        id: 'pa-8',
        title: 'Analysis Delivered',
        narration: 'With payment confirmed, ResearchHub processes the deep-analysis request and returns comprehensive research data to ContentForge.',
        fromAgent: 'ResearchHub',
        toAgent: 'ContentForge',
        protocol: 'transport',
        action: 'deliver-result',
        duration: 3000,
      },
    ],
  },
  {
    id: 'multi-hop',
    name: 'Multi-Hop Delegation',
    description: 'A content pipeline request chains through three agents, each delegating subtasks.',
    protocolsUsed: ['transport', 'orchestration', 'discovery', 'observability'],
    steps: [
      {
        id: 'mh-1',
        title: 'User Requests Pipeline',
        narration: 'A user submits: "Create a comprehensive content report on trending AI topics." This requires research, market data, and content synthesis.',
        action: 'user-request',
        duration: 3000,
      },
      {
        id: 'mh-2',
        title: 'ContentForge Receives',
        narration: 'The Protocol API routes to ContentForge based on the "content-pipeline" capability match. ContentForge begins orchestrating the multi-step workflow.',
        fromAgent: 'Protocol API',
        toAgent: 'ContentForge',
        protocol: 'orchestration',
        action: 'receive-request',
        duration: 2500,
      },
      {
        id: 'mh-3',
        title: 'Delegate to ResearchHub',
        narration: 'ContentForge identifies it needs research data. It delegates a sub-request to ResearchHub: "Provide research analysis on AI agent protocols."',
        fromAgent: 'ContentForge',
        toAgent: 'ResearchHub',
        protocol: 'transport',
        action: 'delegate',
        duration: 3000,
      },
      {
        id: 'mh-4',
        title: 'ResearchHub Queries MarketPulse',
        narration: 'ResearchHub needs current market trends to contextualize its research. It sends a sub-request to MarketPulse: "What are the top trending topics in AI?"',
        fromAgent: 'ResearchHub',
        toAgent: 'MarketPulse',
        protocol: 'transport',
        action: 'delegate',
        duration: 3000,
      },
      {
        id: 'mh-5',
        title: 'MarketPulse Scans Feeds',
        narration: 'MarketPulse processes the request by scanning its configured feeds, applying signal scoring, and ranking trending topics by relevance.',
        fromAgent: 'MarketPulse',
        protocol: 'orchestration',
        action: 'process',
        duration: 3500,
      },
      {
        id: 'mh-6',
        title: 'Trending Topics Returned',
        narration: 'MarketPulse returns 12 trending topics to ResearchHub, each with relevance scores, source counts, and trend direction indicators.',
        fromAgent: 'MarketPulse',
        toAgent: 'ResearchHub',
        protocol: 'transport',
        action: 'return-result',
        duration: 2500,
      },
      {
        id: 'mh-7',
        title: 'ResearchHub Generates Narrative',
        narration: 'ResearchHub combines its research data with MarketPulse trends. It generates a structured narrative with citations, trend analysis, and market context.',
        fromAgent: 'ResearchHub',
        protocol: 'orchestration',
        action: 'generate',
        duration: 4000,
      },
      {
        id: 'mh-8',
        title: 'Research Returned',
        narration: 'ResearchHub returns the enriched research narrative to ContentForge with full provenance: which data came from MarketPulse, which was original research.',
        fromAgent: 'ResearchHub',
        toAgent: 'ContentForge',
        protocol: 'transport',
        action: 'return-result',
        duration: 2500,
      },
      {
        id: 'mh-9',
        title: 'ContentForge Synthesizes',
        narration: 'ContentForge takes the research narrative and synthesizes it into a polished content draft, adding structure, formatting, and editorial voice.',
        fromAgent: 'ContentForge',
        protocol: 'orchestration',
        action: 'synthesize',
        duration: 4000,
      },
      {
        id: 'mh-10',
        title: 'Draft Delivered',
        narration: 'The final content draft is delivered to the user. The observability log shows the complete multi-hop chain: User -> ContentForge -> ResearchHub -> MarketPulse and back.',
        fromAgent: 'ContentForge',
        protocol: 'observability',
        action: 'deliver',
        duration: 3000,
      },
    ],
  },
  {
    id: 'trust-establishment',
    name: 'Trust Establishment',
    description: 'An unknown agent connects and progressively builds trust through identity verification and successful interactions.',
    protocolsUsed: ['identity', 'trust', 'transport'],
    steps: [
      {
        id: 'te-1',
        title: 'Unknown Agent Connects',
        narration: 'A new agent "DataMiner-7" attempts to connect to the Protocol API. It has never been seen before — no trust record exists.',
        fromAgent: 'DataMiner-7',
        toAgent: 'Protocol API',
        protocol: 'transport',
        action: 'connect',
        duration: 3000,
      },
      {
        id: 'te-2',
        title: 'First-Contact Challenge',
        narration: 'The Protocol API issues a first-contact identity challenge: a cryptographic nonce that the agent must sign with its private key to prove ownership of its claimed identity.',
        fromAgent: 'Protocol API',
        toAgent: 'DataMiner-7',
        protocol: 'identity',
        action: 'challenge',
        duration: 3000,
      },
      {
        id: 'te-3',
        title: 'Identity Proof Response',
        narration: 'DataMiner-7 signs the nonce with its private key and returns the signature along with its DID document containing the corresponding public key.',
        fromAgent: 'DataMiner-7',
        toAgent: 'Protocol API',
        protocol: 'identity',
        action: 'prove-identity',
        duration: 3000,
      },
      {
        id: 'te-4',
        title: 'DID Verification',
        narration: 'The Protocol API resolves the DID document, extracts the public key, and verifies the signature against the original nonce. Identity confirmed: DataMiner-7 is who it claims to be.',
        protocol: 'identity',
        action: 'verify',
        duration: 3500,
      },
      {
        id: 'te-5',
        title: 'Trust Score Initialized',
        narration: 'A trust record is created for DataMiner-7 with a neutral score of 50/100. The agent is allowed to make requests but with rate limiting applied.',
        protocol: 'trust',
        action: 'initialize-trust',
        duration: 3000,
      },
      {
        id: 'te-6',
        title: 'Successful Interaction',
        narration: 'DataMiner-7 makes a valid research query and receives a response. The interaction is clean — no anomalies, proper protocol adherence, timely response handling.',
        fromAgent: 'DataMiner-7',
        toAgent: 'ResearchHub',
        protocol: 'trust',
        action: 'record-interaction',
        duration: 3000,
      },
      {
        id: 'te-7',
        title: 'Trust Score Upgraded',
        narration: 'After the successful interaction, DataMiner-7\'s trust score increases to 65/100 and its trust level upgrades from "neutral" to "trusted." Rate limits are relaxed.',
        protocol: 'trust',
        action: 'upgrade-trust',
        duration: 3000,
      },
    ],
  },
  {
    id: 'protocol-switching',
    name: 'Protocol Live-Switching',
    description: 'Switch transport, payment, and encryption protocols at runtime and observe the change in behavior.',
    protocolsUsed: ['transport', 'payment', 'encryption', 'observability'],
    steps: [
      {
        id: 'ps-1',
        title: 'Current Config: Basic',
        narration: 'The system is running with the Basic preset: HTTP REST transport, mock payments, no encryption. All messages flow as plain JSON over HTTP.',
        protocol: 'transport',
        action: 'show-config',
        duration: 3000,
      },
      {
        id: 'ps-2',
        title: 'Open Protocol Drawer',
        narration: 'The user opens the Protocol Configuration drawer from the sidebar. The current stack is displayed with all 11 protocol layers and their active providers.',
        action: 'open-drawer',
        highlight: 'ProtocolDrawer',
        duration: 2500,
      },
      {
        id: 'ps-3',
        title: 'Switch to WebSocket',
        narration: 'The user changes the Transport layer from "HTTP REST" to "WebSocket." This enables persistent bidirectional connections between agents.',
        protocol: 'transport',
        action: 'switch-transport',
        duration: 3000,
      },
      {
        id: 'ps-4',
        title: 'Switch to x402-USDC',
        narration: 'The user changes the Payment layer from "Mock" to "x402-USDC." Future paid requests will require real USDC transactions via the x402 protocol.',
        protocol: 'payment',
        action: 'switch-payment',
        duration: 3000,
      },
      {
        id: 'ps-5',
        title: 'Switch to Envelope Encryption',
        narration: 'The user changes the Encryption layer from "None" to "Envelope." All inter-agent messages will now be encrypted with a per-session symmetric key, wrapped with the recipient\'s public key.',
        protocol: 'encryption',
        action: 'switch-encryption',
        duration: 3000,
      },
      {
        id: 'ps-6',
        title: 'Apply Configuration',
        narration: 'The user clicks "Apply." The Protocol API accepts the new configuration and hot-swaps the active providers. No restart required — all changes take effect immediately.',
        action: 'apply-config',
        duration: 3000,
      },
      {
        id: 'ps-7',
        title: 'New Stack Active',
        narration: 'The next request from ContentForge uses the new stack: WebSocket transport, x402-USDC payments, envelope encryption. The message is encrypted, sent over WS, and triggers a payment flow.',
        fromAgent: 'ContentForge',
        toAgent: 'ResearchHub',
        protocol: 'transport',
        action: 'new-stack-request',
        duration: 3500,
      },
      {
        id: 'ps-8',
        title: 'Observability Shows Change',
        narration: 'The observability log shows the protocol change event: before/after comparison for each layer, timestamp, and confirmation that the new stack is operational.',
        protocol: 'observability',
        action: 'log-change',
        duration: 3000,
      },
    ],
  },
  {
    id: 'failure-recovery',
    name: 'Failure & Recovery',
    description: 'An agent goes offline, triggering retry logic and circuit breaker protection.',
    protocolsUsed: ['resilience', 'transport', 'observability'],
    steps: [
      {
        id: 'fr-1',
        title: 'MarketPulse Goes Offline',
        narration: 'MarketPulse crashes unexpectedly. Its health check endpoint stops responding. The Protocol API detects the status change: ONLINE -> OFFLINE.',
        fromAgent: 'MarketPulse',
        protocol: 'resilience',
        action: 'agent-offline',
        duration: 3000,
      },
      {
        id: 'fr-2',
        title: 'ResearchHub Sends Request',
        narration: 'ResearchHub, unaware of the outage, sends a trend-detection request to MarketPulse as part of an active research workflow.',
        fromAgent: 'ResearchHub',
        toAgent: 'MarketPulse',
        protocol: 'transport',
        action: 'send-request',
        duration: 2500,
      },
      {
        id: 'fr-3',
        title: 'Connection Refused',
        narration: 'The request fails with ECONNREFUSED. The retry provider catches the error and begins the retry sequence. Attempt 1 of 3 failed.',
        fromAgent: 'MarketPulse',
        toAgent: 'ResearchHub',
        protocol: 'resilience',
        action: 'connection-refused',
        duration: 3000,
      },
      {
        id: 'fr-4',
        title: 'Retry Attempt 2',
        narration: 'After a 1-second exponential backoff delay, the retry provider sends attempt 2. MarketPulse is still down — connection refused again.',
        fromAgent: 'ResearchHub',
        toAgent: 'MarketPulse',
        protocol: 'resilience',
        action: 'retry',
        duration: 3500,
      },
      {
        id: 'fr-5',
        title: 'Retry Attempt 3 (Final)',
        narration: 'After a 2-second backoff, attempt 3 is sent. Still no response. All retry attempts exhausted. The request is marked as failed.',
        fromAgent: 'ResearchHub',
        toAgent: 'MarketPulse',
        protocol: 'resilience',
        action: 'retry-exhausted',
        duration: 3500,
      },
      {
        id: 'fr-6',
        title: 'Circuit Breaker Trips',
        narration: 'The failure threshold is reached. The circuit breaker for MarketPulse transitions from CLOSED to OPEN. No further requests will be sent to MarketPulse for the next 30 seconds.',
        protocol: 'resilience',
        action: 'circuit-breaker-open',
        duration: 3500,
      },
      {
        id: 'fr-7',
        title: 'Fast Rejection',
        narration: 'A subsequent request targeting MarketPulse is immediately rejected by the circuit breaker without even attempting a connection. Error: "Circuit breaker OPEN for MarketPulse."',
        fromAgent: 'ResearchHub',
        toAgent: 'MarketPulse',
        protocol: 'resilience',
        action: 'fast-reject',
        duration: 3000,
      },
    ],
  },
  {
    id: 'mcp-vs-a2a',
    name: 'MCP vs A2A Comparison',
    description: 'Send the same query via A2A and MCP protocols and compare request format, response structure, and features.',
    protocolsUsed: ['transport', 'negotiation', 'observability'],
    steps: [
      {
        id: 'mc-1',
        title: 'Same Query via A2A',
        narration: 'The query "Analyze trending AI topics" is sent via A2A protocol. The request is formatted as JSON-RPC 2.0: { jsonrpc: "2.0", method: "research/analyze", params: { query: "..." } }',
        protocol: 'transport',
        action: 'a2a-request',
        duration: 3500,
      },
      {
        id: 'mc-2',
        title: 'A2A Response',
        narration: 'A2A returns a JSON-RPC 2.0 response with result payload, metadata (provider, model, tokens), and updated execution context. The response includes structured content and provenance.',
        protocol: 'transport',
        action: 'a2a-response',
        duration: 3500,
      },
      {
        id: 'mc-3',
        title: 'Same Query via MCP',
        narration: 'The same query is sent via MCP protocol. The request uses MCP\'s tools/call format: { method: "tools/call", params: { name: "analyze_trends", arguments: { query: "..." } } }',
        protocol: 'transport',
        action: 'mcp-request',
        duration: 3500,
      },
      {
        id: 'mc-4',
        title: 'MCP Response',
        narration: 'MCP returns a tool result with content array: [{ type: "text", text: "..." }]. The format is simpler but lacks metadata, context propagation, and multi-step orchestration.',
        protocol: 'transport',
        action: 'mcp-response',
        duration: 3500,
      },
      {
        id: 'mc-5',
        title: 'Side-by-Side Results',
        narration: 'Both responses contain equivalent analysis content. The raw data is the same — the difference is in the protocol envelope, metadata richness, and orchestration capabilities.',
        protocol: 'observability',
        action: 'compare-results',
        duration: 3500,
      },
      {
        id: 'mc-6',
        title: 'Feature Comparison',
        narration: 'A2A advantages: built-in payment (x402), trust scoring, multi-hop delegation, execution context. MCP advantages: simpler integration, tool-centric model, wider LLM support.',
        protocol: 'negotiation',
        action: 'feature-comparison',
        duration: 4000,
      },
    ],
  },
  {
    id: 'full-pipeline',
    name: 'Full Content Pipeline',
    description: 'End-to-end flow combining discovery, negotiation, payment, multi-hop delegation, and content generation.',
    protocolsUsed: ['discovery', 'negotiation', 'payment', 'transport', 'trust', 'orchestration', 'observability'],
    steps: [
      {
        id: 'fp-1',
        title: 'Pipeline Initiated',
        narration: 'A user requests: "Produce a premium research report on AI agent interoperability." This triggers the full content pipeline across all three agents.',
        action: 'user-request',
        duration: 3000,
      },
      {
        id: 'fp-2',
        title: 'Agent Discovery',
        narration: 'The Protocol API discovers all available agents via .well-known endpoints. Three agents are online: ResearchHub, MarketPulse, ContentForge.',
        protocol: 'discovery',
        action: 'discover-all',
        duration: 2500,
      },
      {
        id: 'fp-3',
        title: 'Route to ContentForge',
        narration: 'The orchestration layer determines ContentForge should lead the pipeline. It has the "content-pipeline" capability that matches the report generation intent.',
        fromAgent: 'Protocol API',
        toAgent: 'ContentForge',
        protocol: 'orchestration',
        action: 'route',
        duration: 2500,
      },
      {
        id: 'fp-4',
        title: 'Negotiate with ResearchHub',
        narration: 'ContentForge negotiates with ResearchHub. The capability card shows "premium-analysis" requires 1.00 USDC. ContentForge accepts the terms.',
        fromAgent: 'ContentForge',
        toAgent: 'ResearchHub',
        protocol: 'negotiation',
        action: 'negotiate',
        duration: 3000,
      },
      {
        id: 'fp-5',
        title: 'Payment Flow',
        narration: 'ContentForge pays 1.00 USDC to ResearchHub via x402. Invoice created, payment submitted, transaction verified on-chain in 3 seconds.',
        fromAgent: 'ContentForge',
        toAgent: 'ResearchHub',
        protocol: 'payment',
        action: 'pay',
        duration: 3500,
      },
      {
        id: 'fp-6',
        title: 'ResearchHub Analyzes',
        narration: 'ResearchHub begins premium analysis. It queries its knowledge base, generates research categories, and identifies key narratives around AI interoperability.',
        fromAgent: 'ResearchHub',
        protocol: 'orchestration',
        action: 'analyze',
        duration: 4000,
      },
      {
        id: 'fp-7',
        title: 'MarketPulse Enrichment',
        narration: 'ResearchHub delegates trend enrichment to MarketPulse. No payment required — MarketPulse offers trend-detection as a free capability. Trust score check passes.',
        fromAgent: 'ResearchHub',
        toAgent: 'MarketPulse',
        protocol: 'trust',
        action: 'delegate-with-trust',
        duration: 3000,
      },
      {
        id: 'fp-8',
        title: 'Market Data Returns',
        narration: 'MarketPulse returns 15 trending topics related to AI interoperability, each with signal strength, source count, and trend direction.',
        fromAgent: 'MarketPulse',
        toAgent: 'ResearchHub',
        protocol: 'transport',
        action: 'return-data',
        duration: 2500,
      },
      {
        id: 'fp-9',
        title: 'Research Synthesis',
        narration: 'ResearchHub merges its analysis with MarketPulse trends. It generates a structured research narrative with 5 sections, 12 citations, and trend-correlated insights.',
        fromAgent: 'ResearchHub',
        protocol: 'orchestration',
        action: 'synthesize',
        duration: 4000,
      },
      {
        id: 'fp-10',
        title: 'Return to ContentForge',
        narration: 'The enriched research package is returned to ContentForge. It includes the narrative, raw data, provenance chain, and MarketPulse attribution.',
        fromAgent: 'ResearchHub',
        toAgent: 'ContentForge',
        protocol: 'transport',
        action: 'return-research',
        duration: 2500,
      },
      {
        id: 'fp-11',
        title: 'Content Generation',
        narration: 'ContentForge produces the final premium report: executive summary, detailed analysis, trend visualizations, methodology notes, and source bibliography.',
        fromAgent: 'ContentForge',
        protocol: 'orchestration',
        action: 'generate-report',
        duration: 4500,
      },
      {
        id: 'fp-12',
        title: 'Report Delivered',
        narration: 'The premium report is delivered to the user. The observability log shows the full pipeline: 4 agents, 8 hops, 1 payment, 3 protocol layers active. Total time: 38 seconds.',
        fromAgent: 'ContentForge',
        protocol: 'observability',
        action: 'deliver-report',
        duration: 3500,
      },
    ],
  },
];

export const useDemoStore = defineStore('demo', () => {
  const scenarios = ref<DemoScenario[]>(SCENARIOS);
  const activeScenario = ref<DemoScenario | null>(null);
  const currentStepIndex = ref(0);
  const isPlaying = ref(false);
  const playbackSpeed = ref(1);

  let autoPlayTimer: ReturnType<typeof setTimeout> | null = null;

  const currentStep = computed<DemoStep | null>(() => {
    if (!activeScenario.value) return null;
    return activeScenario.value.steps[currentStepIndex.value] ?? null;
  });

  const totalSteps = computed(() => {
    return activeScenario.value?.steps.length ?? 0;
  });

  const isFirstStep = computed(() => currentStepIndex.value === 0);
  const isLastStep = computed(() => {
    return activeScenario.value
      ? currentStepIndex.value >= activeScenario.value.steps.length - 1
      : true;
  });

  function startScenario(id: string) {
    const scenario = scenarios.value.find((s) => s.id === id);
    if (!scenario) {
      throw new Error(`Scenario not found: ${id}`);
    }
    stopAutoPlay();
    activeScenario.value = scenario;
    currentStepIndex.value = 0;
    isPlaying.value = false;
  }

  function nextStep() {
    if (!activeScenario.value) return;
    if (currentStepIndex.value < activeScenario.value.steps.length - 1) {
      currentStepIndex.value++;
    }
  }

  function prevStep() {
    if (currentStepIndex.value > 0) {
      currentStepIndex.value--;
    }
  }

  function pause() {
    isPlaying.value = false;
    stopAutoPlay();
  }

  function resume() {
    if (!activeScenario.value) return;
    isPlaying.value = true;
    scheduleNextStep();
  }

  function stop() {
    stopAutoPlay();
    isPlaying.value = false;
    activeScenario.value = null;
    currentStepIndex.value = 0;
  }

  function autoPlay() {
    if (!activeScenario.value) return;
    isPlaying.value = true;
    currentStepIndex.value = 0;
    scheduleNextStep();
  }

  function setPlaybackSpeed(speed: number) {
    playbackSpeed.value = speed;
    if (isPlaying.value) {
      stopAutoPlay();
      scheduleNextStep();
    }
  }

  function scheduleNextStep() {
    if (!activeScenario.value || !isPlaying.value) return;

    const step = activeScenario.value.steps[currentStepIndex.value];
    if (!step) return;

    const delay = step.duration / playbackSpeed.value;

    autoPlayTimer = setTimeout(() => {
      if (!isPlaying.value || !activeScenario.value) return;

      if (currentStepIndex.value < activeScenario.value.steps.length - 1) {
        currentStepIndex.value++;
        scheduleNextStep();
      } else {
        isPlaying.value = false;
      }
    }, delay);
  }

  function stopAutoPlay() {
    if (autoPlayTimer !== null) {
      clearTimeout(autoPlayTimer);
      autoPlayTimer = null;
    }
  }

  return {
    scenarios,
    activeScenario,
    currentStepIndex,
    isPlaying,
    playbackSpeed,
    currentStep,
    totalSteps,
    isFirstStep,
    isLastStep,
    startScenario,
    nextStep,
    prevStep,
    pause,
    resume,
    stop,
    autoPlay,
    setPlaybackSpeed,
  };
});
