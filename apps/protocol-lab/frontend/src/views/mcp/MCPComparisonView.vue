<script setup lang="ts">
const a2aRequest = `{
  "jsonrpc": "2.0",
  "id": "req-001",
  "method": "research.getTrending",
  "params": {
    "context": {
      "orgSlug": "demo-org",
      "conversationId": "conv-abc123",
      "agentSlug": "content-forge"
    },
    "payload": {
      "category": "artificial-intelligence",
      "limit": 5,
      "timeRange": "7d"
    }
  }
}`;

const a2aResponse = `{
  "jsonrpc": "2.0",
  "id": "req-001",
  "result": {
    "success": true,
    "payload": {
      "content": {
        "topics": [
          { "topic": "Multi-agent systems", "score": 0.95 },
          { "topic": "MCP adoption", "score": 0.88 },
          { "topic": "Agent-to-agent protocols", "score": 0.82 }
        ]
      },
      "metadata": {
        "provider": "research-hub",
        "model": "analysis-v2",
        "tokenUsage": { "input": 120, "output": 340 },
        "latencyMs": 142
      }
    },
    "context": {
      "orgSlug": "demo-org",
      "conversationId": "conv-abc123",
      "agentSlug": "research-hub"
    }
  }
}`;

const mcpRequest = `{
  "method": "tools/call",
  "params": {
    "name": "get_trending",
    "arguments": {
      "category": "artificial-intelligence",
      "limit": 5,
      "timeRange": "7d"
    }
  }
}`;

const mcpResponse = `{
  "content": [
    {
      "type": "text",
      "text": "{\\n  \\"topics\\": [\\n    { \\"topic\\": \\"Multi-agent systems\\", \\"score\\": 0.95 },\\n    { \\"topic\\": \\"MCP adoption\\", \\"score\\": 0.88 },\\n    { \\"topic\\": \\"Agent-to-agent protocols\\", \\"score\\": 0.82 }\\n  ]\\n}"
    }
  ],
  "isError": false
}`;

interface ComparisonRow {
  feature: string;
  a2a: string;
  a2aSupport: 'yes' | 'no' | 'partial';
  mcp: string;
  mcpSupport: 'yes' | 'no' | 'partial';
}

const comparisonTable: ComparisonRow[] = [
  { feature: 'Bidirectional', a2a: 'Yes', a2aSupport: 'yes', mcp: 'No', mcpSupport: 'no' },
  { feature: 'Discovery', a2a: '.well-known/agent.json', a2aSupport: 'yes', mcp: 'Server config', mcpSupport: 'partial' },
  { feature: 'Streaming', a2a: 'SSE', a2aSupport: 'yes', mcp: 'Tool streaming', mcpSupport: 'partial' },
  { feature: 'Payment', a2a: 'Built-in layer', a2aSupport: 'yes', mcp: 'N/A', mcpSupport: 'no' },
  { feature: 'Multi-hop', a2a: 'Native delegation', a2aSupport: 'yes', mcp: 'Via chaining', mcpSupport: 'partial' },
  { feature: 'Identity', a2a: 'DID / keypair', a2aSupport: 'yes', mcp: 'OAuth/API key', mcpSupport: 'partial' },
  { feature: 'Protocol', a2a: 'JSON-RPC 2.0', a2aSupport: 'yes', mcp: 'JSON-RPC 2.0', mcpSupport: 'yes' },
  { feature: 'Trust scoring', a2a: 'Built-in layer', a2aSupport: 'yes', mcp: 'N/A', mcpSupport: 'no' },
  { feature: 'Observability', a2a: 'Built-in layer', a2aSupport: 'yes', mcp: 'Custom', mcpSupport: 'partial' },
  { feature: 'Agent autonomy', a2a: 'Full (peer-to-peer)', a2aSupport: 'yes', mcp: 'Tool-use (host-controlled)', mcpSupport: 'partial' },
];

function supportBadgeClass(support: 'yes' | 'no' | 'partial'): string {
  switch (support) {
    case 'yes': return 'text-emerald-400';
    case 'no': return 'text-red-400';
    case 'partial': return 'text-yellow-400';
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">A2A vs MCP Comparison</h1>
      <p class="text-gray-400 mt-1">Side-by-side comparison of Agent-to-Agent protocol and Model Context Protocol for the same operation.</p>
    </div>

    <!-- Side-by-side payloads -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- A2A Panel -->
      <div class="card">
        <div class="flex items-center gap-2 mb-4">
          <span class="w-2 h-2 bg-blue-500 rounded-full" />
          <h2 class="text-lg font-semibold text-blue-300">A2A Protocol</h2>
        </div>

        <div class="space-y-4">
          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs text-gray-400 uppercase tracking-wider">Request</span>
              <span class="text-xs text-gray-400 font-mono">JSON-RPC 2.0</span>
            </div>
            <pre class="bg-gray-950 rounded-lg p-4 text-xs font-mono text-blue-200 overflow-x-auto leading-relaxed border border-gray-800">{{ a2aRequest }}</pre>
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs text-gray-400 uppercase tracking-wider">Response</span>
              <span class="text-xs text-emerald-600 font-mono">142ms</span>
            </div>
            <pre class="bg-gray-950 rounded-lg p-4 text-xs font-mono text-emerald-200 overflow-x-auto leading-relaxed border border-gray-800">{{ a2aResponse }}</pre>
          </div>

          <div class="flex gap-4 text-xs">
            <div class="flex items-center gap-1.5">
              <span class="text-gray-400">Latency:</span>
              <span class="text-white font-mono">142ms</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="text-gray-400">Overhead:</span>
              <span class="text-white font-mono">~280 bytes</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="text-gray-400">Metadata:</span>
              <span class="text-emerald-400">Included</span>
            </div>
          </div>
        </div>
      </div>

      <!-- MCP Panel -->
      <div class="card">
        <div class="flex items-center gap-2 mb-4">
          <span class="w-2 h-2 bg-purple-500 rounded-full" />
          <h2 class="text-lg font-semibold text-purple-300">MCP Protocol</h2>
        </div>

        <div class="space-y-4">
          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs text-gray-400 uppercase tracking-wider">Request</span>
              <span class="text-xs text-gray-400 font-mono">tools/call</span>
            </div>
            <pre class="bg-gray-950 rounded-lg p-4 text-xs font-mono text-purple-200 overflow-x-auto leading-relaxed border border-gray-800">{{ mcpRequest }}</pre>
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs text-gray-400 uppercase tracking-wider">Response</span>
              <span class="text-xs text-emerald-600 font-mono">138ms</span>
            </div>
            <pre class="bg-gray-950 rounded-lg p-4 text-xs font-mono text-purple-200 overflow-x-auto leading-relaxed border border-gray-800">{{ mcpResponse }}</pre>
          </div>

          <div class="flex gap-4 text-xs">
            <div class="flex items-center gap-1.5">
              <span class="text-gray-400">Latency:</span>
              <span class="text-white font-mono">138ms</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="text-gray-400">Overhead:</span>
              <span class="text-white font-mono">~90 bytes</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="text-gray-400">Metadata:</span>
              <span class="text-red-400">None</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Key Differences callout -->
    <div class="card border border-gray-700">
      <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Key Differences</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div class="bg-gray-950 rounded-lg p-4 border border-gray-800">
          <div class="text-blue-400 font-semibold mb-1">Context Propagation</div>
          <p class="text-gray-400">A2A carries ExecutionContext through every hop. MCP has no concept of cross-agent context.</p>
        </div>
        <div class="bg-gray-950 rounded-lg p-4 border border-gray-800">
          <div class="text-blue-400 font-semibold mb-1">Observability</div>
          <p class="text-gray-400">A2A includes metadata (tokens, model, latency) in every response. MCP returns raw content only.</p>
        </div>
        <div class="bg-gray-950 rounded-lg p-4 border border-gray-800">
          <div class="text-blue-400 font-semibold mb-1">Agent Autonomy</div>
          <p class="text-gray-400">A2A agents negotiate peer-to-peer. MCP tools are invoked by the host LLM, not by other agents.</p>
        </div>
      </div>
    </div>

    <!-- Feature Comparison Table -->
    <div class="card">
      <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Feature Comparison</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-700">
              <th class="text-left py-2 px-3 text-gray-400 font-medium">Feature</th>
              <th class="text-left py-2 px-3 text-blue-400 font-medium">A2A</th>
              <th class="text-left py-2 px-3 text-purple-400 font-medium">MCP</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in comparisonTable"
              :key="row.feature"
              class="border-b border-gray-800 hover:bg-gray-800/50 transition-colors"
            >
              <td class="py-2.5 px-3 text-white">{{ row.feature }}</td>
              <td class="py-2.5 px-3">
                <span :class="supportBadgeClass(row.a2aSupport)">{{ row.a2a }}</span>
              </td>
              <td class="py-2.5 px-3">
                <span :class="supportBadgeClass(row.mcpSupport)">{{ row.mcp }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
