<template>
  <div class="detail-view">
    <div class="detail-header">
      <h2>MCP Servers</h2>
      <div class="header-actions">
        <ion-button fill="clear" size="small" @click="fetchData" :disabled="loading">
          <ion-icon :icon="refreshOutline" slot="icon-only" />
        </ion-button>
      </div>
    </div>

    <div class="detail-body">
      <div class="loading-state" v-if="loading">
        <ion-spinner />
        <p>Connecting to MCP server...</p>
      </div>

      <div class="error-state" v-else-if="connectError">
        <ion-icon :icon="alertCircleOutline" class="error-icon" />
        <h3>MCP Server Unavailable</h3>
        <p>{{ connectError }}</p>
        <ion-button @click="fetchData" fill="outline" size="small">Retry</ion-button>
      </div>

      <div class="content-area" v-else>
        <!-- Server info banner -->
        <div class="server-banner">
          <ion-icon :icon="terminalOutline" class="banner-icon" />
          <div class="server-info">
            <span class="server-name">{{ serverInfo?.name ?? 'MCP Server' }}</span>
            <span class="server-meta">
              v{{ serverInfo?.version ?? '?' }} &middot;
              Protocol {{ serverInfo?.protocolVersion ?? '?' }} &middot;
              {{ allTools.length }} tool{{ allTools.length !== 1 ? 's' : '' }}
            </span>
          </div>
          <ion-badge color="success" class="status-pill">Connected</ion-badge>
        </div>

        <!-- Search -->
        <ion-searchbar
          v-model="toolSearch"
          placeholder="Search tools..."
          mode="md"
          class="tool-searchbar"
        />

        <!-- Namespace cards -->
        <div class="namespace-grid" v-if="!toolSearch">
          <div class="namespace-card" v-for="ns in namespaces" :key="ns.name">
            <div class="namespace-header">
              <ion-icon :icon="cubeOutline" class="ns-icon" />
              <span class="ns-name">{{ ns.name }}</span>
              <ion-badge color="primary" class="ns-count">{{ ns.tools.length }}</ion-badge>
            </div>
            <div class="ns-tool-list">
              <div
                class="ns-tool-item"
                v-for="tool in ns.tools"
                :key="tool.name"
                @click="openToolDetail(tool)"
              >
                <span class="tool-name">{{ shortToolName(tool.name) }}</span>
                <span class="tool-desc">{{ truncateDesc(tool.description) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Flat searchable tool list -->
        <div class="section-card" v-if="toolSearch">
          <h4 class="section-title">Results ({{ filteredTools.length }})</h4>
          <div class="empty-state small" v-if="filteredTools.length === 0">
            <p>No tools match "{{ toolSearch }}".</p>
          </div>
          <div class="tool-list" v-else>
            <div
              class="tool-row"
              v-for="tool in filteredTools"
              :key="tool.name"
              @click="openToolDetail(tool)"
            >
              <div class="tool-row-main">
                <span class="tool-full-name mono">{{ tool.name }}</span>
                <ion-badge color="medium" class="param-badge">
                  {{ paramCount(tool) }} param{{ paramCount(tool) !== 1 ? 's' : '' }}
                </ion-badge>
              </div>
              <p class="tool-row-desc">{{ tool.description ?? 'No description.' }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tool Detail Modal -->
    <ion-modal :is-open="detailModalOpen" @did-dismiss="closeDetailModal">
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ selectedTool?.name }}</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="closeDetailModal">Close</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="modal-content" v-if="selectedTool">
        <div class="tool-detail-body">
          <p class="tool-description">{{ selectedTool.description ?? 'No description provided.' }}</p>

          <div class="section-card" v-if="toolParameters(selectedTool).length > 0">
            <h4 class="section-title">Parameters</h4>
            <div class="param-list">
              <div class="param-row" v-for="param in toolParameters(selectedTool)" :key="param.name">
                <div class="param-header">
                  <span class="param-name mono">{{ param.name }}</span>
                  <ion-badge color="primary" v-if="param.required">required</ion-badge>
                  <span class="param-type mono">{{ param.type }}</span>
                </div>
                <p class="param-description" v-if="param.description">{{ param.description }}</p>
              </div>
            </div>
          </div>

          <div class="empty-state small" v-else>
            <p>This tool has no parameters.</p>
          </div>
        </div>
      </ion-content>
    </ion-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import {
  IonButton, IonIcon, IonSpinner, IonBadge, IonSearchbar,
  IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonContent,
  toastController,
} from '@ionic/vue';
import {
  refreshOutline, alertCircleOutline, terminalOutline, cubeOutline,
} from 'ionicons/icons';

// MCP client — direct axios instance, NOT adminApiService
const mcpClient = axios.create({ baseURL: '/mcp-api' });

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };
}

interface McpServerInfo {
  name: string;
  version: string;
  protocolVersion: string;
}

interface ToolParam {
  name: string;
  type: string;
  description?: string;
  required: boolean;
}

interface Namespace {
  name: string;
  tools: McpTool[];
}

const loading = ref(false);
const connectError = ref<string | null>(null);
const serverInfo = ref<McpServerInfo | null>(null);
const allTools = ref<McpTool[]>([]);
const toolSearch = ref('');
const detailModalOpen = ref(false);
const selectedTool = ref<McpTool | null>(null);

const namespaces = computed<Namespace[]>(() => {
  const map = new Map<string, McpTool[]>();
  for (const tool of allTools.value) {
    const parts = tool.name.split('_');
    const ns = parts.length > 1 ? parts[0] : 'general';
    const existing = map.get(ns);
    if (existing) {
      existing.push(tool);
    } else {
      map.set(ns, [tool]);
    }
  }
  return Array.from(map.entries())
    .map(([name, tools]) => ({ name, tools }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

const filteredTools = computed<McpTool[]>(() => {
  const q = toolSearch.value.toLowerCase().trim();
  if (!q) return allTools.value;
  return allTools.value.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      (t.description ?? '').toLowerCase().includes(q),
  );
});

function shortToolName(name: string): string {
  const parts = name.split('_');
  return parts.length > 1 ? parts.slice(1).join('_') : name;
}

function truncateDesc(desc?: string): string {
  if (!desc) return 'No description.';
  return desc.length > 80 ? desc.slice(0, 80) + '…' : desc;
}

function paramCount(tool: McpTool): number {
  return Object.keys(tool.inputSchema?.properties ?? {}).length;
}

function toolParameters(tool: McpTool): ToolParam[] {
  const props = tool.inputSchema?.properties ?? {};
  const required = tool.inputSchema?.required ?? [];
  return Object.entries(props).map(([name, schema]) => ({
    name,
    type: schema.type ?? 'any',
    description: schema.description,
    required: required.includes(name),
  }));
}

function openToolDetail(tool: McpTool): void {
  selectedTool.value = tool;
  detailModalOpen.value = true;
}

function closeDetailModal(): void {
  detailModalOpen.value = false;
  selectedTool.value = null;
}

async function fetchData(): Promise<void> {
  loading.value = true;
  connectError.value = null;
  allTools.value = [];
  serverInfo.value = null;

  try {
    // Step 1: Initialize
    const initRes = await mcpClient.post('', {
      jsonrpc: '2.0',
      id: 'init-1',
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        clientInfo: { name: 'admin-ui', version: '1.0.0' },
        capabilities: {},
      },
    });

    const initResult = initRes.data?.result;
    if (!initResult) {
      connectError.value = 'MCP server returned an invalid initialize response.';
      return;
    }

    serverInfo.value = {
      name: initResult.serverInfo?.name ?? 'MCP Server',
      version: initResult.serverInfo?.version ?? '?',
      protocolVersion: initResult.protocolVersion ?? '?',
    };

    // Step 2: List tools
    const toolsRes = await mcpClient.post('', {
      jsonrpc: '2.0',
      id: 'list-1',
      method: 'tools/list',
      params: {},
    });

    const toolsList = toolsRes.data?.result?.tools;
    if (!Array.isArray(toolsList)) {
      connectError.value = 'MCP server returned an invalid tools/list response.';
      return;
    }

    allTools.value = toolsList as McpTool[];
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Could not connect to MCP server.';
    connectError.value = message;
    const toast = await toastController.create({
      message: `MCP connection failed: ${message}`,
      duration: 4000,
      color: 'danger',
    });
    await toast.present();
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchData();
});
</script>

<style scoped>
.detail-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  background: var(--ion-toolbar-background, var(--ion-color-light));
}

.detail-header h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--ion-text-color, #333);
}

.header-actions {
  display: flex;
  gap: 0.25rem;
}

.detail-body {
  flex: 1;
  overflow-y: auto;
}

.content-area {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
}

/* Server Banner */
.server-banner {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.875rem 1.25rem;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 8px;
  color: white;
  border: 1px solid rgba(99, 102, 241, 0.3);
}

.banner-icon {
  font-size: 1.5rem;
  color: #818cf8;
  flex-shrink: 0;
}

.server-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.server-name {
  font-weight: 600;
  font-size: 1rem;
}

.server-meta {
  font-size: 0.78rem;
  opacity: 0.75;
}

.status-pill {
  flex-shrink: 0;
}

/* Search */
.tool-searchbar {
  --background: var(--ion-card-background, var(--ion-background-color));
  --border-radius: 8px;
  padding: 0;
}

/* Namespace Grid */
.namespace-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.namespace-card {
  background: var(--ion-card-background, var(--ion-background-color));
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  border-radius: 8px;
  overflow: hidden;
}

.namespace-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--ion-toolbar-background, var(--ion-color-light));
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
}

.ns-icon {
  color: var(--ion-color-primary);
  font-size: 1rem;
}

.ns-name {
  flex: 1;
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--ion-text-color);
  font-family: monospace;
}

.ns-count {
  font-size: 0.7rem;
}

.ns-tool-list {
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.ns-tool-item {
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.ns-tool-item:hover {
  background: var(--ion-color-step-50, rgba(0, 0, 0, 0.04));
}

.tool-name {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--ion-color-primary);
  font-family: monospace;
}

.tool-desc {
  font-size: 0.75rem;
  color: var(--dark-text-muted, #888);
}

/* Flat tool list */
.section-card {
  background: var(--ion-card-background, var(--ion-background-color));
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  border-radius: 8px;
  padding: 1rem;
}

.section-title {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--dark-text-muted, #888);
}

.tool-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tool-row {
  padding: 0.75rem;
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.tool-row:hover {
  background: var(--ion-color-step-50, rgba(0, 0, 0, 0.03));
}

.tool-row-main {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.tool-full-name {
  flex: 1;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--ion-text-color);
}

.param-badge {
  font-size: 0.7rem;
  flex-shrink: 0;
}

.tool-row-desc {
  margin: 0;
  font-size: 0.8rem;
  color: var(--dark-text-muted, #888);
}

/* Tool detail modal */
.modal-content {
  --background: var(--ion-background-color);
}

.tool-detail-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.tool-description {
  margin: 0;
  font-size: 0.9rem;
  color: var(--ion-text-color);
  line-height: 1.5;
}

.param-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.param-row {
  padding: 0.75rem;
  background: var(--ion-color-step-50, rgba(0, 0, 0, 0.03));
  border-radius: 6px;
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
}

.param-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.param-name {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--ion-text-color);
}

.param-type {
  font-size: 0.75rem;
  color: var(--dark-text-muted, #888);
  margin-left: auto;
}

.param-description {
  margin: 0.4rem 0 0;
  font-size: 0.8rem;
  color: var(--dark-text-muted, #888);
}

.mono {
  font-family: monospace;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--ion-color-medium);
}

.empty-state.small {
  padding: 1.5rem 1rem;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: var(--ion-color-medium);
}

.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  gap: 0.75rem;
  color: var(--ion-color-medium);
}

.error-icon {
  font-size: 3rem;
  color: #ef4444;
}

.error-state h3 {
  margin: 0;
  color: var(--ion-text-color);
}

.error-state p {
  margin: 0;
  font-size: 0.875rem;
  text-align: center;
}

@media (max-width: 768px) {
  .namespace-grid {
    grid-template-columns: 1fr;
  }
}
</style>
