<script setup lang="ts">
import EmptyState from '../../components/shared/EmptyState.vue';

const metrics = {
  totalMessages: 1247,
  avgLatency: 142,
  successRate: 97.3,
  totalCost: 0.0847,
};

const protocolCounts = [
  { label: 'A2A JSON-RPC', count: 523, color: 'bg-blue-500' },
  { label: 'HTTP REST', count: 412, color: 'bg-green-500' },
  { label: 'WebSocket', count: 198, color: 'bg-purple-500' },
  { label: 'gRPC', count: 87, color: 'bg-orange-500' },
  { label: 'MCP', count: 27, color: 'bg-cyan-500' },
];

const latencyBuckets = [
  { label: '0-50ms', count: 312, color: 'bg-green-500' },
  { label: '50-100ms', count: 428, color: 'bg-green-400' },
  { label: '100-200ms', count: 287, color: 'bg-yellow-500' },
  { label: '200-500ms', count: 156, color: 'bg-orange-500' },
  { label: '500ms+', count: 64, color: 'bg-red-500' },
];

const maxProtocol = Math.max(...protocolCounts.map((p) => p.count));
const maxLatency = Math.max(...latencyBuckets.map((b) => b.count));
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Metrics</h1>
      <p class="text-gray-400 text-sm mt-1">System-wide performance and cost metrics</p>
    </div>

    <EmptyState
      v-if="metrics.totalMessages === 0"
      title="No Metrics"
      message="No metrics data yet. Agent communication activity will be tracked here."
    />

    <template v-else>
      <!-- Metric cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="card">
          <p class="text-xs text-gray-400 mb-1">Total Messages</p>
          <p class="text-2xl font-bold text-white">{{ metrics.totalMessages.toLocaleString() }}</p>
        </div>
        <div class="card">
          <p class="text-xs text-gray-400 mb-1">Avg Latency</p>
          <p class="text-2xl font-bold text-white">{{ metrics.avgLatency }}ms</p>
        </div>
        <div class="card">
          <p class="text-xs text-gray-400 mb-1">Success Rate</p>
          <p class="text-2xl font-bold text-green-400">{{ metrics.successRate }}%</p>
        </div>
        <div class="card">
          <p class="text-xs text-gray-400 mb-1">Total Cost</p>
          <p class="text-2xl font-bold text-white">${{ metrics.totalCost.toFixed(4) }}</p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Messages per protocol -->
        <div class="card">
          <h2 class="text-sm font-medium text-gray-300 mb-4">Messages by Protocol</h2>
          <div class="space-y-3">
            <div v-for="proto in protocolCounts" :key="proto.label" class="flex items-center gap-3">
              <span class="text-xs text-gray-400 w-28 flex-shrink-0">{{ proto.label }}</span>
              <div class="flex-1 h-6 bg-gray-800 rounded overflow-hidden">
                <div
                  :class="['h-full rounded transition-all', proto.color]"
                  :style="{ width: `${(proto.count / maxProtocol) * 100}%` }"
                />
              </div>
              <span class="text-xs text-gray-400 w-12 text-right">{{ proto.count }}</span>
            </div>
          </div>
        </div>

        <!-- Latency distribution -->
        <div class="card">
          <h2 class="text-sm font-medium text-gray-300 mb-4">Latency Distribution</h2>
          <div class="space-y-3">
            <div v-for="bucket in latencyBuckets" :key="bucket.label" class="flex items-center gap-3">
              <span class="text-xs text-gray-400 w-20 flex-shrink-0">{{ bucket.label }}</span>
              <div class="flex-1 h-6 bg-gray-800 rounded overflow-hidden">
                <div
                  :class="['h-full rounded transition-all', bucket.color]"
                  :style="{ width: `${(bucket.count / maxLatency) * 100}%` }"
                />
              </div>
              <span class="text-xs text-gray-400 w-12 text-right">{{ bucket.count }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
