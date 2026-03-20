<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { CircuitBreakerState } from '../../types';
import EmptyState from '../../components/shared/EmptyState.vue';

interface AgentNode {
  id: string;
  label: string;
  x: number;
  y: number;
  color: string;
  status: 'online' | 'offline' | 'degraded';
}

interface Connection {
  from: string;
  to: string;
  protocol: string;
  color: string;
}

// Extended connection with circuit breaker state attached
interface ConnectionWithCB extends Connection {
  circuitBreaker: CircuitBreakerState;
}

const agents = ref<AgentNode[]>([
  { id: 'research-hub', label: 'ResearchHub', x: 200, y: 150, color: '#3b82f6', status: 'online' },
  { id: 'market-pulse', label: 'MarketPulse', x: 500, y: 150, color: '#22c55e', status: 'online' },
  { id: 'content-forge', label: 'ContentForge', x: 350, y: 350, color: '#a855f7', status: 'online' },
]);

// Deterministic mock circuit breaker state per target agent id.
// Uses the same seed logic as MessageDetail so behavior is consistent.
function mockCircuitBreakerForTarget(targetId: string): CircuitBreakerState {
  const seed = targetId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const stateIndex = seed % 10;
  const state: 'CLOSED' | 'HALF_OPEN' | 'OPEN' =
    stateIndex < 6 ? 'CLOSED' : stateIndex < 8 ? 'HALF_OPEN' : 'OPEN';
  const failureCount = state === 'CLOSED' ? seed % 2 : state === 'HALF_OPEN' ? 2 + (seed % 2) : 5;
  const lastFailure = state === 'CLOSED'
    ? null
    : new Date(Date.now() - (seed % 60) * 1000).toISOString();
  return { state, failureCount, threshold: 5, cooldownMs: 30000, lastFailure };
}

const connectionsWithCB = computed<ConnectionWithCB[]>(() => [
  {
    from: 'research-hub',
    to: 'market-pulse',
    protocol: 'A2A JSON-RPC',
    color: '#6b7280',
    circuitBreaker: mockCircuitBreakerForTarget('market-pulse'),
  },
  {
    from: 'research-hub',
    to: 'content-forge',
    protocol: 'A2A JSON-RPC',
    color: '#6b7280',
    circuitBreaker: mockCircuitBreakerForTarget('content-forge'),
  },
  {
    from: 'market-pulse',
    to: 'content-forge',
    protocol: 'HTTP REST',
    color: '#6b7280',
    circuitBreaker: mockCircuitBreakerForTarget('content-forge'),
  },
]);

// Return stroke color based on circuit breaker state
function edgeStrokeColor(cb: CircuitBreakerState): string {
  switch (cb.state) {
    case 'OPEN': return '#ef4444';       // red-500
    case 'HALF_OPEN': return '#eab308';  // yellow-500
    default: return '#6b7280';           // gray-500
  }
}

// OPEN connections get a more pronounced dash; all others use existing dash pattern
function edgeDashArray(cb: CircuitBreakerState): string {
  return cb.state === 'OPEN' ? '8 4' : '6 3';
}

// Label text color mirrors edge color
function edgeLabelFill(cb: CircuitBreakerState): string {
  switch (cb.state) {
    case 'OPEN': return '#f87171';       // red-400
    case 'HALF_OPEN': return '#facc15';  // yellow-400
    default: return '#9ca3af';           // gray-400
  }
}

// CB state badge text to show below the protocol label
function cbLabel(cb: CircuitBreakerState): string {
  switch (cb.state) {
    case 'OPEN': return 'CB: OPEN';
    case 'HALF_OPEN': return 'CB: HALF_OPEN';
    default: return '';
  }
}

const dragging = ref<string | null>(null);
const dragOffset = ref({ x: 0, y: 0 });
const svgRef = ref<SVGSVGElement | null>(null);

function getNode(id: string): AgentNode {
  return agents.value.find((a) => a.id === id)!;
}

function statusColorClass(status: string): string {
  switch (status) {
    case 'online': return '#22c55e';
    case 'offline': return '#ef4444';
    case 'degraded': return '#eab308';
    default: return '#6b7280';
  }
}

function onPointerDown(event: PointerEvent, id: string) {
  const node = getNode(id);
  dragging.value = id;
  dragOffset.value = { x: event.clientX - node.x, y: event.clientY - node.y };
  (event.target as Element).setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) return;
  const node = agents.value.find((a) => a.id === dragging.value);
  if (node) {
    node.x = event.clientX - dragOffset.value.x;
    node.y = event.clientY - dragOffset.value.y;
  }
}

function onPointerUp() {
  dragging.value = null;
}

onMounted(() => {
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
});

onUnmounted(() => {
  document.removeEventListener('pointermove', onPointerMove);
  document.removeEventListener('pointerup', onPointerUp);
});

function connectionMidpoint(conn: Connection) {
  const from = getNode(conn.from);
  const to = getNode(conn.to);
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Network Topology</h1>
      <p class="text-gray-400 text-sm mt-1">Interactive view of agent connections and protocols. Drag nodes to rearrange.</p>
    </div>

    <EmptyState
      v-if="agents.length === 0"
      title="No Agents"
      message="No agents discovered. Start the agent services to see the network topology."
    />

    <template v-else>
    <div class="card p-0 overflow-hidden">
      <svg
        ref="svgRef"
        class="w-full bg-gray-900 rounded-lg"
        viewBox="0 0 700 520"
        style="min-height: 500px;"
      >
        <!-- Connections -->
        <g v-for="conn in connectionsWithCB" :key="`${conn.from}-${conn.to}`">
          <!-- Edge line — red + wider dash when OPEN, yellow when HALF_OPEN, gray when CLOSED -->
          <line
            :x1="getNode(conn.from).x"
            :y1="getNode(conn.from).y"
            :x2="getNode(conn.to).x"
            :y2="getNode(conn.to).y"
            :stroke="edgeStrokeColor(conn.circuitBreaker)"
            :stroke-width="conn.circuitBreaker.state === 'OPEN' ? 3 : 2"
            :stroke-dasharray="edgeDashArray(conn.circuitBreaker)"
          />

          <!-- Label background — taller when circuit breaker state is non-CLOSED -->
          <rect
            :x="connectionMidpoint(conn).x - 50"
            :y="connectionMidpoint(conn).y - (cbLabel(conn.circuitBreaker) ? 20 : 10)"
            width="100"
            :height="cbLabel(conn.circuitBreaker) ? 36 : 20"
            rx="4"
            :fill="conn.circuitBreaker.state === 'OPEN' ? '#450a0a' : conn.circuitBreaker.state === 'HALF_OPEN' ? '#422006' : '#1f2937'"
            :stroke="conn.circuitBreaker.state === 'OPEN' ? '#7f1d1d' : conn.circuitBreaker.state === 'HALF_OPEN' ? '#713f12' : '#374151'"
            stroke-width="1"
          />

          <!-- Protocol name label -->
          <text
            :x="connectionMidpoint(conn).x"
            :y="connectionMidpoint(conn).y + (cbLabel(conn.circuitBreaker) ? -7 : 4)"
            text-anchor="middle"
            :fill="edgeLabelFill(conn.circuitBreaker)"
            font-size="10"
          >
            {{ conn.protocol }}
          </text>

          <!-- Circuit breaker state sub-label (only shown when non-CLOSED) -->
          <text
            v-if="cbLabel(conn.circuitBreaker)"
            :x="connectionMidpoint(conn).x"
            :y="connectionMidpoint(conn).y + 8"
            text-anchor="middle"
            :fill="edgeLabelFill(conn.circuitBreaker)"
            font-size="9"
            font-weight="700"
          >
            {{ cbLabel(conn.circuitBreaker) }}
          </text>
        </g>

        <!-- Agent Nodes -->
        <g
          v-for="agent in agents"
          :key="agent.id"
          class="cursor-grab active:cursor-grabbing"
          @pointerdown="onPointerDown($event, agent.id)"
        >
          <!-- Outer ring -->
          <circle
            :cx="agent.x"
            :cy="agent.y"
            r="45"
            :fill="agent.color + '20'"
            :stroke="agent.color"
            stroke-width="2"
          />
          <!-- Inner circle -->
          <circle
            :cx="agent.x"
            :cy="agent.y"
            r="30"
            :fill="agent.color + '40'"
          />
          <!-- Status dot -->
          <circle
            :cx="agent.x + 30"
            :cy="agent.y - 30"
            r="6"
            :fill="statusColorClass(agent.status)"
            stroke="#111827"
            stroke-width="2"
          />
          <!-- Label -->
          <text
            :x="agent.x"
            :y="agent.y + 4"
            text-anchor="middle"
            fill="white"
            font-size="12"
            font-weight="600"
          >
            {{ agent.label }}
          </text>
          <!-- Port label -->
          <text
            :x="agent.x"
            :y="agent.y + 60"
            text-anchor="middle"
            fill="#6b7280"
            font-size="10"
          >
            :{{ agent.id === 'research-hub' ? '6403' : agent.id === 'market-pulse' ? '6404' : '6405' }}
          </text>
        </g>
      </svg>
    </div>

    <!-- Legend -->
    <div class="flex flex-wrap gap-x-6 gap-y-2">
      <p class="text-xs text-gray-500 w-full">Node status</p>
      <div class="flex items-center gap-2">
        <span class="w-3 h-3 rounded-full bg-green-500" />
        <span class="text-xs text-gray-400">Online</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="w-3 h-3 rounded-full bg-yellow-500" />
        <span class="text-xs text-gray-400">Degraded</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="w-3 h-3 rounded-full bg-red-500" />
        <span class="text-xs text-gray-400">Offline</span>
      </div>

      <p class="text-xs text-gray-500 w-full mt-1">Circuit breaker (edge color)</p>
      <div class="flex items-center gap-2">
        <span class="inline-block w-6 h-0.5 bg-gray-500" style="border-top: 2px dashed #6b7280;" />
        <span class="text-xs text-gray-400">CLOSED</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="inline-block w-6 h-0.5" style="border-top: 2px dashed #eab308;" />
        <span class="text-xs text-gray-400">HALF_OPEN</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="inline-block w-6 h-0.5" style="border-top: 3px dashed #ef4444;" />
        <span class="text-xs text-gray-400">OPEN (rejecting)</span>
      </div>
    </div>
    </template>
  </div>
</template>
