<template>
  <ion-modal :is-open="isOpen" @will-dismiss="handleClose">
    <ion-header>
      <ion-toolbar>
        <ion-title>Previous {{ agentDisplayName }} Results</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="handleClose">
            <ion-icon :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <!-- Search & Filters -->
      <div class="filters-row">
        <ion-searchbar
          v-model="searchQuery"
          placeholder="Search analyses..."
          :debounce="300"
          @ionInput="handleFilterChange"
          class="browse-searchbar"
        />
        <ion-select
          v-model="timeFilter"
          placeholder="All Time"
          interface="popover"
          @ionChange="handleFilterChange"
          class="time-select"
        >
          <ion-select-option value="">All Time</ion-select-option>
          <ion-select-option value="today">Today</ion-select-option>
          <ion-select-option value="7days">Last 7 Days</ion-select-option>
          <ion-select-option value="30days">Last 30 Days</ion-select-option>
          <ion-select-option value="90days">Last 90 Days</ion-select-option>
        </ion-select>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="loading-container">
        <ion-spinner name="crescent" />
        <p>Loading results...</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredConversations.length === 0" class="empty-state">
        <ion-icon :icon="documentOutline" class="empty-icon" />
        <h3>No previous results found</h3>
        <p>
          Create a new {{ agentDisplayName.toLowerCase() }} to get started.
        </p>
      </div>

      <!-- Results List -->
      <div v-else class="results-list">
        <ion-card
          v-for="item in filteredConversations"
          :key="item.conversationId"
          class="result-card"
          button
          @click="handleSelect(item)"
        >
          <ion-card-header>
            <div class="card-header-row">
              <ion-card-title class="result-title">{{
                item.title
              }}</ion-card-title>
              <div class="card-header-actions">
                <ion-badge
                  :color="getStatusColor(item.status)"
                  class="type-badge"
                >
                  {{ item.status }}
                </ion-badge>
                <ion-button
                  fill="clear"
                  size="small"
                  color="danger"
                  class="delete-btn"
                  @click.stop="handleDelete(item)"
                >
                  <ion-icon :icon="trashOutline" slot="icon-only" />
                </ion-button>
              </div>
            </div>
            <ion-card-subtitle>{{
              formatRelativeDate(item.createdAt)
            }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content v-if="item.description">
            <p class="description-preview">
              {{ truncate(item.description, 120) }}
            </p>
          </ion-card-content>
        </ion-card>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from "vue";
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonIcon,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonBadge,
} from "@ionic/vue";
import { alertController } from "@ionic/vue";
import { closeOutline, documentOutline, trashOutline } from "ionicons/icons";
import agent2AgentConversationsService from "@/services/agent2AgentConversationsService";
import type { Agent2AgentConversation } from "@/services/agent2AgentConversationsService";
import { tasksService } from "@/services/tasksService";

export interface ConversationBrowseItem {
  conversationId: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
}

const props = defineProps<{
  isOpen: boolean;
  agentName: string;
  agentDisplayName: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "select", item: ConversationBrowseItem): void;
}>();

const searchQuery = ref("");
const timeFilter = ref("");
const isLoading = ref(false);
const conversations = ref<ConversationBrowseItem[]>([]);

const filteredConversations = computed(() => {
  let items = conversations.value;

  // Apply time filter
  if (timeFilter.value) {
    const cutoff = computeCreatedAfter(timeFilter.value);
    if (cutoff) {
      const cutoffDate = new Date(cutoff);
      items = items.filter((item) => new Date(item.createdAt) >= cutoffDate);
    }
  }

  // Apply search filter
  const query = searchQuery.value.trim().toLowerCase();
  if (query) {
    items = items.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query),
    );
  }

  return items;
});

function computeCreatedAfter(filter: string): string | undefined {
  if (!filter) return undefined;
  const now = new Date();
  switch (filter) {
    case "today": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return start.toISOString();
    }
    case "7days": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d.toISOString();
    }
    case "30days": {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return d.toISOString();
    }
    case "90days": {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      return d.toISOString();
    }
    default:
      return undefined;
  }
}

async function loadConversations() {
  isLoading.value = true;

  try {
    // Fetch conversations for this agent
    const response = await agent2AgentConversationsService.listConversations({
      agentName: props.agentName,
      limit: 100,
    });

    // Filter to conversations with completed tasks (these have actual results)
    const withResults = response.conversations.filter(
      (conv: Agent2AgentConversation) => (conv.completedTasks ?? 0) > 0,
    );

    // Enrich conversations with task details (prompts) for better display
    const enriched = await enrichWithTaskDetails(withResults);
    conversations.value = enriched;
  } catch (err) {
    console.error("[ConversationsBrowseModal] Failed to load:", err);
    conversations.value = [];
  } finally {
    isLoading.value = false;
  }
}

/**
 * Fetch the first completed task for each conversation to get the prompt
 * for display in the browse list.
 */
async function enrichWithTaskDetails(
  convs: Agent2AgentConversation[],
): Promise<ConversationBrowseItem[]> {
  const items: ConversationBrowseItem[] = [];

  // Fetch tasks in parallel for all conversations
  const taskPromises = convs.map((conv) =>
    tasksService
      .listTasks({
        conversationId: conv.id,
        status: "completed",
        limit: 1,
      })
      .catch(() => ({ tasks: [], total: 0 })),
  );

  const taskResults = await Promise.all(taskPromises);

  for (let i = 0; i < convs.length; i++) {
    const conv = convs[i];
    const taskResult = taskResults[i];
    const firstTask = taskResult.tasks[0];

    // Build display title from task prompt or conversation metadata
    // Task prompt may be a JSON string (e.g. CAD agent sends structured payload)
    // — extract the human-readable prompt from it
    let taskPrompt = firstTask?.prompt || "";
    if (taskPrompt.startsWith("{")) {
      try {
        const parsed = JSON.parse(taskPrompt);
        taskPrompt = parsed.prompt || parsed.newProjectName || parsed.title || taskPrompt;
      } catch {
        // Not valid JSON, use as-is
      }
    }

    const metadataTitle =
      conv.metadata && typeof conv.metadata === "object"
        ? (conv.metadata as Record<string, unknown>).title
        : undefined;

    let title: string;
    if (taskPrompt) {
      title = taskPrompt;
    } else if (typeof metadataTitle === "string" && metadataTitle) {
      title = metadataTitle;
    } else {
      title = `${props.agentDisplayName} - ${new Date(conv.createdAt).toLocaleDateString()}`;
    }

    // Build description from task method
    const method = firstTask?.method || "";
    const description = method
      ? `${method.charAt(0).toUpperCase() + method.slice(1)} task`
      : "";

    items.push({
      conversationId: conv.id,
      title,
      description,
      status: firstTask?.status || "unknown",
      createdAt: conv.createdAt,
    });
  }

  return items;
}

function handleFilterChange() {
  // Filtering is done via computed, no need to reload
}

function handleClose() {
  emit("close");
}

function handleSelect(item: ConversationBrowseItem) {
  emit("select", item);
  emit("close");
}

async function handleDelete(item: ConversationBrowseItem) {
  const alert = await alertController.create({
    header: "Delete",
    message: `Delete "${truncate(item.title, 60)}"? This cannot be undone.`,
    buttons: [
      { text: "Cancel", role: "cancel" },
      {
        text: "Delete",
        role: "destructive",
        handler: async () => {
          await agent2AgentConversationsService.deleteConversation(
            item.conversationId,
          );
          conversations.value = conversations.value.filter(
            (c) => c.conversationId !== item.conversationId,
          );
        },
      },
    ],
  });
  await alert.present();
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60)
    return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  if (diffHours < 24)
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString();
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    completed: "success",
    running: "primary",
    failed: "danger",
    pending: "warning",
  };
  return colors[status] || "medium";
}

// Load conversations when modal opens
watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      searchQuery.value = "";
      timeFilter.value = "";
      loadConversations();
    }
  },
);
</script>

<style scoped>
.filters-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.browse-searchbar {
  flex: 1;
  --border-radius: 8px;
  --box-shadow: none;
}

.time-select {
  min-width: 140px;
  max-width: 160px;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  gap: 12px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  color: var(--ion-color-medium);
  margin-bottom: 12px;
}

.empty-state h3 {
  margin: 0 0 8px 0;
  color: var(--ion-color-dark);
}

.empty-state p {
  margin: 0;
  color: var(--ion-color-medium);
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-card {
  margin: 0;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.result-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.card-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.delete-btn {
  --padding-start: 4px;
  --padding-end: 4px;
  margin: 0;
  height: 28px;
  opacity: 0.5;
  transition: opacity 0.15s ease;
}

.result-card:hover .delete-btn {
  opacity: 1;
}

.result-title {
  font-size: 1rem;
  line-height: 1.3;
}

.type-badge {
  font-size: 0.7rem;
  text-transform: capitalize;
  flex-shrink: 0;
}

.description-preview {
  margin: 0;
  color: var(--ion-color-medium);
  font-size: 0.85rem;
  line-height: 1.4;
}
</style>
