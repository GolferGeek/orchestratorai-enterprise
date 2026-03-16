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
          placeholder="Search results..."
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
      <div v-if="isLoadingDeliverables" class="loading-container">
        <ion-spinner name="crescent" />
        <p>Loading results...</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="deliverables.length === 0" class="empty-state">
        <ion-icon :icon="documentOutline" class="empty-icon" />
        <h3>No previous results found</h3>
        <p>Create a new {{ agentDisplayName.toLowerCase() }} to get started.</p>
      </div>

      <!-- Results List -->
      <div v-else class="results-list">
        <ion-card
          v-for="deliverable in deliverables"
          :key="deliverable.id"
          class="result-card"
          button
          @click="handleSelect(deliverable)"
        >
          <ion-card-header>
            <div class="card-header-row">
              <ion-card-title class="result-title">{{
                deliverable.title
              }}</ion-card-title>
              <ion-badge
                v-if="deliverable.type"
                :color="getTypeColor(deliverable.type)"
                class="type-badge"
              >
                {{ deliverable.type }}
              </ion-badge>
            </div>
            <ion-card-subtitle>{{
              formatRelativeDate(deliverable.createdAt)
            }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content v-if="deliverable.description">
            <p class="description-preview">
              {{ truncate(deliverable.description, 120) }}
            </p>
          </ion-card-content>
        </ion-card>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script lang="ts" setup>
import { ref, watch } from "vue";
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
import { closeOutline, documentOutline } from "ionicons/icons";
import {
  type DeliverableSearchResult,
} from "@/services/deliverablesService";
import { getDeliverablesService } from "@/services/deliverablesService.impl";

const props = defineProps<{
  isOpen: boolean;
  agentSlug: string;
  agentDisplayName: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "select", deliverable: DeliverableSearchResult): void;
}>();

const searchQuery = ref("");
const timeFilter = ref("");
const isLoadingDeliverables = ref(false);
const deliverables = ref<DeliverableSearchResult[]>([]);

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

async function loadDeliverables() {
  isLoadingDeliverables.value = true;
  try {
    const result = await getDeliverablesService().getDeliverables({
      agentName: props.agentSlug,
      createdAfter: computeCreatedAfter(timeFilter.value),
      search: searchQuery.value.trim() || undefined,
      latestOnly: true,
      limit: 50,
    });
    deliverables.value = result.items;
  } catch (err) {
    console.error(
      "[DeliverablesBrowseModal] Failed to load deliverables:",
      err,
    );
    deliverables.value = [];
  } finally {
    isLoadingDeliverables.value = false;
  }
}

function handleFilterChange() {
  loadDeliverables();
}

function handleClose() {
  emit("close");
}

function handleSelect(deliverable: DeliverableSearchResult) {
  emit("select", deliverable);
  emit("close");
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

function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    document: "primary",
    analysis: "secondary",
    report: "tertiary",
    plan: "success",
    requirements: "warning",
  };
  return colors[type] || "medium";
}

// Load deliverables when modal opens
watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      searchQuery.value = "";
      timeFilter.value = "";
      loadDeliverables();
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
