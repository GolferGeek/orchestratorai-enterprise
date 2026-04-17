<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button />
        </ion-buttons>
        <ion-title>Portfolio Sentinel</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment :value="activeTab" @ionChange="activeTab = ($event.detail.value as string) ?? 'alerts'">
          <ion-segment-button value="alerts">
            <ion-label>
              Alerts
              <ion-badge v-if="newAlertCount > 0" color="danger" style="margin-left: 6px">
                {{ newAlertCount }}
              </ion-badge>
            </ion-label>
          </ion-segment-button>
          <ion-segment-button value="signals">
            <ion-label>Signals</ion-label>
          </ion-segment-button>
          <ion-segment-button value="portfolio">
            <ion-label>Portfolio</ion-label>
          </ion-segment-button>
          <ion-segment-button value="sources">
            <ion-label>Sources</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="!orgSlug" class="empty">No organization selected.</div>

      <!-- ── Sources Tab ─────────────────────────────────────────── -->
      <div v-else-if="activeTab === 'sources'" class="tab-content">
        <div class="tab-toolbar">
          <ion-button size="small" @click="sourceModalOpen = true">
            <ion-icon :icon="addOutline" slot="start" />
            Add Source
          </ion-button>
          <ion-button size="small" fill="outline" :disabled="syncingTriggers" @click="syncTriggers">
            <ion-icon :icon="refreshOutline" slot="start" />
            Sync Triggers
          </ion-button>
        </div>

        <div v-if="sourcesError" class="error-banner">
          <ion-icon :icon="alertCircleOutline" />
          Failed to load sources: {{ sourcesError }}
        </div>

        <div v-if="sources.length === 0 && !sourcesLoading" class="empty">
          No sources configured. Add an RSS feed or webpage to start monitoring.
        </div>

        <ion-list v-else>
          <ion-item v-for="src in sources" :key="src.id" lines="full">
            <ion-label>
              <h2>{{ src.name }}</h2>
              <p>
                <ion-badge :color="sourceTypeBadge(src.source_type)" size="small">
                  {{ src.source_type.toUpperCase() }}
                </ion-badge>
                {{ src.url }}
              </p>
              <p>
                Poll every {{ src.poll_interval_minutes }}m
                <span v-if="src.last_polled_at">
                  &mdash; last polled {{ formatDate(src.last_polled_at) }}
                </span>
              </p>
              <p v-if="src.practice_areas.length" class="tags">
                <ion-chip v-for="pa in src.practice_areas" :key="pa" size="small" color="tertiary">
                  {{ pa }}
                </ion-chip>
              </p>
              <div v-if="src.last_error" class="source-error">
                <ion-icon :icon="alertCircleOutline" color="danger" />
                {{ src.last_error }}
              </div>
            </ion-label>
            <ion-button
              slot="end"
              fill="clear"
              size="small"
              color="primary"
              :disabled="pollingSourceId === src.id"
              @click="pollNow(src)"
            >
              <ion-icon :icon="cloudDownloadOutline" />
            </ion-button>
            <ion-toggle
              slot="end"
              :checked="src.enabled"
              @ionChange="toggleSource(src, $event.detail.checked)"
            />
            <ion-button slot="end" fill="clear" size="small" @click="editSource(src)">
              <ion-icon :icon="createOutline" />
            </ion-button>
            <ion-button slot="end" fill="clear" size="small" color="danger" @click="removeSource(src)">
              <ion-icon :icon="trashOutline" />
            </ion-button>
          </ion-item>
        </ion-list>
      </div>

      <!-- ── Alerts Tab ────────────────────────────────────────── -->
      <div v-else-if="activeTab === 'alerts'" class="tab-content">
        <div class="tab-toolbar">
          <ion-select
            v-model="alertFilterStatus"
            label="Status"
            label-placement="stacked"
            placeholder="All"
            interface="popover"
            style="max-width: 150px"
            @ionChange="loadAlerts"
          >
            <ion-select-option value="">All</ion-select-option>
            <ion-select-option value="new">New</ion-select-option>
            <ion-select-option value="acknowledged">Acknowledged</ion-select-option>
            <ion-select-option value="dismissed">Dismissed</ion-select-option>
            <ion-select-option value="actioned">Actioned</ion-select-option>
          </ion-select>
          <ion-select
            v-model="alertFilterSeverity"
            label="Severity"
            label-placement="stacked"
            placeholder="All"
            interface="popover"
            style="max-width: 150px"
            @ionChange="loadAlerts"
          >
            <ion-select-option value="">All</ion-select-option>
            <ion-select-option value="critical">Critical</ion-select-option>
            <ion-select-option value="high">High</ion-select-option>
            <ion-select-option value="medium">Medium</ion-select-option>
            <ion-select-option value="low">Low</ion-select-option>
          </ion-select>
          <ion-button size="small" fill="clear" @click="loadAlerts">
            <ion-icon :icon="refreshOutline" />
          </ion-button>
        </div>

        <div v-if="alertsLoading" class="empty">Loading alerts...</div>
        <div v-else-if="alertsError" class="error-banner">
          <ion-icon :icon="alertCircleOutline" />
          {{ alertsError }}
        </div>
        <div v-else-if="alerts.length === 0" class="empty">
          No alerts yet. Alerts appear after signals are evaluated against your portfolio.
        </div>

        <ion-list v-else>
          <ion-item
            v-for="alert in alerts"
            :key="alert.id"
            lines="full"
            detail
            @click="toggleAlertExpand(alert.id)"
          >
            <ion-label>
              <div class="alert-header">
                <ion-badge :color="severityBadgeColor(alert.severity)" size="small">
                  {{ alert.severity.toUpperCase() }}
                </ion-badge>
                <ion-badge :color="urgencyBadgeColor(alert.urgency)" size="small">
                  {{ alert.urgency.replace('_', ' ') }}
                </ion-badge>
                <ion-badge v-if="alert.status === 'new'" color="danger" size="small">NEW</ion-badge>
                <span class="alert-score">{{ alert.relevance_score }}%</span>
              </div>
              <h2>{{ alert.summary }}</h2>
              <p class="alert-meta">
                <span>{{ getPortfolioClientName(alert.portfolio_id) }}</span>
                <span>{{ formatDate(alert.created_at) }}</span>
              </p>

              <!-- Expanded detail -->
              <div v-if="expandedAlertId === alert.id" class="alert-detail">
                <div v-if="alertDetails[alert.id]" class="detail-sections">
                  <div class="detail-section">
                    <strong>Signal</strong>
                    <p>{{ alertDetails[alert.id]!.signal.title }}</p>
                    <p v-if="alertDetails[alert.id]!.signal.summary" class="detail-sub">
                      {{ alertDetails[alert.id]!.signal.summary }}
                    </p>
                    <p v-if="alertDetails[alert.id]!.signal.full_text" class="detail-sub full-text">
                      {{ alertDetails[alert.id]!.signal.full_text }}
                    </p>
                  </div>
                  <div class="detail-section">
                    <strong>Client / Holding</strong>
                    <p>
                      {{ alertDetails[alert.id]!.portfolio.client_name }}
                      <span v-if="alertDetails[alert.id]!.portfolio.matter_name">
                        — {{ alertDetails[alert.id]!.portfolio.matter_name }}
                      </span>
                    </p>
                  </div>
                  <div class="detail-section">
                    <strong>Reasoning</strong>
                    <p>{{ alert.reasoning }}</p>
                  </div>
                  <div class="detail-section">
                    <strong>Recommended Action</strong>
                    <p>{{ alert.recommended_action }}</p>
                  </div>
                </div>
                <div v-else class="empty">Loading details...</div>

                <div class="alert-actions" v-if="alert.status === 'new'">
                  <ion-button size="small" color="primary" @click.stop="updateAlert(alert.id, 'acknowledged')">
                    <ion-icon :icon="checkmarkOutline" slot="start" />
                    Acknowledge
                  </ion-button>
                  <ion-button size="small" color="medium" @click.stop="updateAlert(alert.id, 'dismissed')">
                    <ion-icon :icon="closeOutline" slot="start" />
                    Dismiss
                  </ion-button>
                  <ion-button size="small" color="success" @click.stop="updateAlert(alert.id, 'actioned')">
                    <ion-icon :icon="checkmarkDoneOutline" slot="start" />
                    Action Taken
                  </ion-button>
                </div>
                <div class="alert-actions" v-else-if="alert.status === 'acknowledged'">
                  <ion-button size="small" color="success" @click.stop="updateAlert(alert.id, 'actioned')">
                    <ion-icon :icon="checkmarkDoneOutline" slot="start" />
                    Action Taken
                  </ion-button>
                  <ion-button size="small" color="medium" @click.stop="updateAlert(alert.id, 'dismissed')">
                    <ion-icon :icon="closeOutline" slot="start" />
                    Dismiss
                  </ion-button>
                </div>
              </div>
            </ion-label>
          </ion-item>
        </ion-list>
      </div>

      <!-- ── Signals Tab ──────────────────────────────────────── -->
      <div v-else-if="activeTab === 'signals'" class="tab-content">
        <!-- Error banner for sources with errors -->
        <div v-if="sourcesWithErrors.length > 0" class="error-banner">
          <ion-icon :icon="alertCircleOutline" />
          {{ sourcesWithErrors.length }} source{{ sourcesWithErrors.length > 1 ? 's' : '' }} with errors:
          {{ sourcesWithErrors.map(s => s.name).join(', ') }}
        </div>

        <!-- Filter bar -->
        <div class="tab-toolbar">
          <ion-select
            v-model="signalFilterSource"
            label="Source"
            label-placement="stacked"
            placeholder="All Sources"
            interface="popover"
            style="max-width: 200px"
            @ionChange="loadSignals"
          >
            <ion-select-option value="">All Sources</ion-select-option>
            <ion-select-option v-for="src in sources" :key="src.id" :value="src.id">
              {{ src.name }}
            </ion-select-option>
          </ion-select>
          <ion-select
            v-model="signalFilterType"
            label="Type"
            label-placement="stacked"
            placeholder="All Types"
            interface="popover"
            style="max-width: 160px"
            @ionChange="loadSignals"
          >
            <ion-select-option value="">All Types</ion-select-option>
            <ion-select-option value="enforcement">Enforcement</ion-select-option>
            <ion-select-option value="ruling">Ruling</ion-select-option>
            <ion-select-option value="legislation">Legislation</ion-select-option>
            <ion-select-option value="guidance">Guidance</ion-select-option>
            <ion-select-option value="news">News</ion-select-option>
          </ion-select>
          <ion-button size="small" fill="clear" @click="loadSignals">
            <ion-icon :icon="refreshOutline" />
          </ion-button>
        </div>

        <div v-if="signalsLoading" class="empty">Loading signals...</div>
        <div v-else-if="signalsError" class="error-banner">
          <ion-icon :icon="alertCircleOutline" />
          {{ signalsError }}
        </div>
        <div v-else-if="signals.length === 0" class="empty">
          No signals yet. Signals appear after sources are polled.
        </div>

        <ion-list v-else>
          <ion-item
            v-for="sig in signals"
            :key="sig.id"
            lines="full"
            :detail="!!sig.full_text"
            @click="toggleSignalExpand(sig.id)"
          >
            <ion-label>
              <div class="signal-header">
                <ion-badge v-if="sig.signal_type" :color="signalTypeBadge(sig.signal_type)" size="small">
                  {{ sig.signal_type }}
                </ion-badge>
                <h2>{{ sig.title }}</h2>
              </div>
              <p v-if="sig.summary">{{ sig.summary }}</p>
              <p class="signal-meta">
                <span v-if="getSourceName(sig.source_id)">{{ getSourceName(sig.source_id) }}</span>
                <span v-if="sig.published_at">{{ formatDate(sig.published_at) }}</span>
                <span>Ingested {{ formatDate(sig.ingested_at) }}</span>
              </p>

              <!-- Expanded detail -->
              <div v-if="expandedSignalId === sig.id" class="signal-detail">
                <div v-if="sig.full_text" class="detail-section">
                  <strong>Full Text</strong>
                  <p>{{ sig.full_text }}</p>
                </div>
                <div v-if="sig.url" class="detail-section">
                  <strong>URL</strong>
                  <p><a :href="sig.url" target="_blank" rel="noopener">{{ sig.url }}</a></p>
                </div>
                <div v-if="sig.jurisdictions.length" class="detail-section">
                  <strong>Jurisdictions</strong>
                  <div class="tags">
                    <ion-chip v-for="j in sig.jurisdictions" :key="j" size="small" color="secondary">{{ j }}</ion-chip>
                  </div>
                </div>
                <div v-if="sig.practice_areas.length" class="detail-section">
                  <strong>Practice Areas</strong>
                  <div class="tags">
                    <ion-chip v-for="pa in sig.practice_areas" :key="pa" size="small" color="tertiary">{{ pa }}</ion-chip>
                  </div>
                </div>
              </div>
            </ion-label>
          </ion-item>
        </ion-list>
      </div>

      <!-- ── Portfolio Tab ────────────────────────────────────── -->
      <div v-else-if="activeTab === 'portfolio'" class="tab-content">
        <div class="tab-toolbar">
          <ion-button size="small" @click="portfolioModalOpen = true">
            <ion-icon :icon="addOutline" slot="start" />
            Add Holding
          </ion-button>
          <ion-select
            v-model="portfolioFilterActive"
            label="Filter"
            label-placement="stacked"
            placeholder="All"
            interface="popover"
            style="max-width: 140px"
            @ionChange="loadPortfolio"
          >
            <ion-select-option value="">All</ion-select-option>
            <ion-select-option value="true">Active</ion-select-option>
            <ion-select-option value="false">Inactive</ion-select-option>
          </ion-select>
        </div>

        <div v-if="portfolioLoading" class="empty">Loading portfolio...</div>
        <div v-else-if="portfolioError" class="error-banner">
          <ion-icon :icon="alertCircleOutline" />
          {{ portfolioError }}
        </div>
        <div v-else-if="portfolio.length === 0" class="empty">
          No portfolio holdings. Add client matters to enable alert matching.
        </div>

        <ion-list v-else>
          <ion-item v-for="h in portfolio" :key="h.id" lines="full">
            <ion-label>
              <h2>
                {{ h.client_name }}
                <ion-badge v-if="!h.active" color="medium" style="margin-left: 6px">Inactive</ion-badge>
              </h2>
              <p v-if="h.matter_name">{{ h.matter_name }}</p>
              <p v-if="h.description" class="holding-desc">{{ h.description }}</p>
              <div class="tags" v-if="h.practice_areas.length || h.jurisdictions.length">
                <ion-chip v-for="pa in h.practice_areas" :key="pa" size="small" color="tertiary">{{ pa }}</ion-chip>
                <ion-chip v-for="j in h.jurisdictions" :key="j" size="small" color="secondary">{{ j }}</ion-chip>
              </div>
              <div class="tags" v-if="h.key_entities.length">
                <ion-chip v-for="e in h.key_entities" :key="e" size="small" color="warning">{{ e }}</ion-chip>
              </div>
            </ion-label>
            <ion-button slot="end" fill="clear" size="small" @click="editHolding(h)">
              <ion-icon :icon="createOutline" />
            </ion-button>
            <ion-button
              v-if="h.active"
              slot="end"
              fill="clear"
              size="small"
              color="danger"
              @click="deactivateHolding(h)"
            >
              <ion-icon :icon="trashOutline" />
            </ion-button>
          </ion-item>
        </ion-list>
      </div>
    </ion-content>

    <!-- ── Source Create/Edit Modal ────────────────────────────── -->
    <ion-modal :is-open="sourceModalOpen" @didDismiss="closeSourceModal">
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ editingSource ? 'Edit Source' : 'Add Source' }}</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="closeSourceModal">Close</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <ion-list>
          <ion-item>
            <ion-input
              v-model="sourceForm.name"
              label="Name"
              label-placement="stacked"
              placeholder="e.g., SEC Enforcement Actions"
            />
          </ion-item>
          <ion-item>
            <ion-select
              v-model="sourceForm.sourceType"
              label="Source Type"
              label-placement="stacked"
            >
              <ion-select-option value="rss">RSS</ion-select-option>
              <ion-select-option value="webpage">Webpage</ion-select-option>
              <ion-select-option value="api">API</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-input
              v-model="sourceForm.url"
              label="URL"
              label-placement="stacked"
              placeholder="https://..."
            />
          </ion-item>
          <ion-item>
            <ion-select
              v-model="sourceForm.pollIntervalMinutes"
              label="Poll Interval"
              label-placement="stacked"
            >
              <ion-select-option :value="15">Every 15 minutes</ion-select-option>
              <ion-select-option :value="30">Every 30 minutes</ion-select-option>
              <ion-select-option :value="60">Every hour</ion-select-option>
              <ion-select-option :value="240">Every 4 hours</ion-select-option>
              <ion-select-option :value="720">Every 12 hours</ion-select-option>
              <ion-select-option :value="1440">Every 24 hours</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-input
              v-model="sourceForm.practiceAreasStr"
              label="Practice Areas (comma-separated)"
              label-placement="stacked"
              placeholder="securities, data-privacy"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="sourceForm.jurisdictionsStr"
              label="Jurisdictions (comma-separated)"
              label-placement="stacked"
              placeholder="us-federal, eu"
            />
          </ion-item>
        </ion-list>
        <ion-button expand="block" class="ion-margin-top" @click="saveSource">
          {{ editingSource ? 'Update' : 'Create' }}
        </ion-button>
      </ion-content>
    </ion-modal>

    <!-- ── Portfolio Create/Edit Modal ────────────────────────────── -->
    <ion-modal :is-open="portfolioModalOpen" @didDismiss="closePortfolioModal">
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ editingHolding ? 'Edit Holding' : 'Add Holding' }}</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="closePortfolioModal">Close</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <ion-list>
          <ion-item>
            <ion-input
              v-model="portfolioForm.clientName"
              label="Client Name"
              label-placement="stacked"
              placeholder="e.g., Acme Corp"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="portfolioForm.matterName"
              label="Matter Name"
              label-placement="stacked"
              placeholder="e.g., EU Subsidiary Operations"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="portfolioForm.practiceAreasStr"
              label="Practice Areas (comma-separated)"
              label-placement="stacked"
              placeholder="data-privacy, corporate"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="portfolioForm.jurisdictionsStr"
              label="Jurisdictions (comma-separated)"
              label-placement="stacked"
              placeholder="eu, us-delaware"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="portfolioForm.keyEntitiesStr"
              label="Key Entities (comma-separated)"
              label-placement="stacked"
              placeholder="Acme EU GmbH, GDPR"
            />
          </ion-item>
          <ion-item>
            <ion-textarea
              v-model="portfolioForm.description"
              label="Description"
              label-placement="stacked"
              placeholder="Describe the holding for cross-reference matching..."
              :auto-grow="true"
              :rows="3"
            />
          </ion-item>
        </ion-list>
        <ion-button expand="block" class="ion-margin-top" @click="saveHolding">
          {{ editingHolding ? 'Update' : 'Create' }}
        </ion-button>
      </ion-content>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonMenuButton,
  IonButton,
  IonIcon,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonBadge,
  IonList,
  IonItem,
  IonToggle,
  IonChip,
  IonModal,
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption,
} from '@ionic/vue';
import {
  addOutline,
  createOutline,
  trashOutline,
  alertCircleOutline,
  refreshOutline,
  checkmarkOutline,
  closeOutline,
  checkmarkDoneOutline,
  cloudDownloadOutline,
} from 'ionicons/icons';
import { storeToRefs } from 'pinia';
import { useRbacStore } from '@/stores/rbacStore';
import {
  sentinelService,
  type SentinelSource,
  type SentinelSignal,
  type SentinelPortfolioHolding,
  type SentinelAlert,
  type AlertDetail,
  type AlertStatus,
  type SourceType,
} from './sentinelService';

const rbac = useRbacStore();
const { user, currentOrganization } = storeToRefs(rbac);
const orgSlug = computed(() => {
  const active = currentOrganization.value;
  if (active && active !== '*') return active;
  return 'legal';
});

const activeTab = ref('alerts');
const newAlertCount = ref(0);

// ── Sources state ──────────────────────────────────────────────────────
const sources = ref<SentinelSource[]>([]);
const sourcesLoading = ref(false);
const sourcesError = ref<string | null>(null);

async function loadSources() {
  if (!orgSlug.value) return;
  sourcesLoading.value = true;
  sourcesError.value = null;
  try {
    sources.value = await sentinelService.listSources(orgSlug.value);
  } catch (e) {
    sourcesError.value = (e as Error).message;
  } finally {
    sourcesLoading.value = false;
  }
}

onMounted(() => {
  loadSources();
  loadSignals();
  loadPortfolio();
  loadAlerts();
});

// ── Signals state ─────────────────────────────────────────────────────
const signals = ref<SentinelSignal[]>([]);
const signalsLoading = ref(false);
const signalsError = ref<string | null>(null);
const signalFilterSource = ref('');
const signalFilterType = ref('');
const expandedSignalId = ref<string | null>(null);

const sourcesWithErrors = computed(() =>
  sources.value.filter((s) => s.last_error),
);

async function loadSignals() {
  if (!orgSlug.value) return;
  signalsLoading.value = true;
  signalsError.value = null;
  try {
    signals.value = await sentinelService.listSignals(orgSlug.value, {
      sourceId: signalFilterSource.value || undefined,
      signalType: signalFilterType.value || undefined,
    });
  } catch (e) {
    signalsError.value = (e as Error).message;
  } finally {
    signalsLoading.value = false;
  }
}

function toggleSignalExpand(id: string) {
  expandedSignalId.value = expandedSignalId.value === id ? null : id;
}

function getSourceName(sourceId: string): string {
  return sources.value.find((s) => s.id === sourceId)?.name ?? '';
}

function signalTypeBadge(type: string): string {
  switch (type) {
    case 'enforcement':
      return 'danger';
    case 'ruling':
      return 'primary';
    case 'legislation':
      return 'warning';
    case 'guidance':
      return 'success';
    case 'news':
      return 'medium';
    default:
      return 'medium';
  }
}

// ── Portfolio state ────────────────────────────────────────────────────
const portfolio = ref<SentinelPortfolioHolding[]>([]);
const portfolioLoading = ref(false);
const portfolioError = ref<string | null>(null);
const portfolioFilterActive = ref('');

async function loadPortfolio() {
  if (!orgSlug.value) return;
  portfolioLoading.value = true;
  portfolioError.value = null;
  try {
    portfolio.value = await sentinelService.listPortfolio(orgSlug.value, {
      active:
        portfolioFilterActive.value === ''
          ? undefined
          : portfolioFilterActive.value === 'true',
    });
  } catch (e) {
    portfolioError.value = (e as Error).message;
  } finally {
    portfolioLoading.value = false;
  }
}

// ── Portfolio modal ───────────────────────────────────────────────────
const portfolioModalOpen = ref(false);
const editingHolding = ref<SentinelPortfolioHolding | null>(null);
const portfolioForm = ref({
  clientName: '',
  matterName: '',
  practiceAreasStr: '',
  jurisdictionsStr: '',
  keyEntitiesStr: '',
  description: '',
});

function editHolding(h: SentinelPortfolioHolding) {
  editingHolding.value = h;
  portfolioForm.value = {
    clientName: h.client_name,
    matterName: h.matter_name ?? '',
    practiceAreasStr: h.practice_areas.join(', '),
    jurisdictionsStr: h.jurisdictions.join(', '),
    keyEntitiesStr: h.key_entities.join(', '),
    description: h.description ?? '',
  };
  portfolioModalOpen.value = true;
}

function closePortfolioModal() {
  portfolioModalOpen.value = false;
  editingHolding.value = null;
  portfolioForm.value = {
    clientName: '',
    matterName: '',
    practiceAreasStr: '',
    jurisdictionsStr: '',
    keyEntitiesStr: '',
    description: '',
  };
}

async function saveHolding() {
  try {
    const dto = {
      clientName: portfolioForm.value.clientName,
      matterName: portfolioForm.value.matterName || undefined,
      practiceAreas: splitTags(portfolioForm.value.practiceAreasStr),
      jurisdictions: splitTags(portfolioForm.value.jurisdictionsStr),
      keyEntities: splitTags(portfolioForm.value.keyEntitiesStr),
      description: portfolioForm.value.description || undefined,
    };
    if (editingHolding.value) {
      await sentinelService.updatePortfolioHolding(
        editingHolding.value.id,
        orgSlug.value,
        dto,
      );
    } else {
      await sentinelService.createPortfolioHolding(orgSlug.value, dto);
    }
    closePortfolioModal();
    await loadPortfolio();
  } catch (e) {
    portfolioError.value = (e as Error).message;
  }
}

async function deactivateHolding(h: SentinelPortfolioHolding) {
  await sentinelService.deactivatePortfolioHolding(h.id, orgSlug.value);
  await loadPortfolio();
}

// ── Source modal ───────────────────────────────────────────────────────
const sourceModalOpen = ref(false);
const editingSource = ref<SentinelSource | null>(null);
const sourceForm = ref({
  name: '',
  sourceType: 'rss' as SourceType,
  url: '',
  pollIntervalMinutes: 60,
  practiceAreasStr: '',
  jurisdictionsStr: '',
});

function editSource(src: SentinelSource) {
  editingSource.value = src;
  sourceForm.value = {
    name: src.name,
    sourceType: src.source_type,
    url: src.url,
    pollIntervalMinutes: src.poll_interval_minutes,
    practiceAreasStr: src.practice_areas.join(', '),
    jurisdictionsStr: src.jurisdictions.join(', '),
  };
  sourceModalOpen.value = true;
}

function closeSourceModal() {
  sourceModalOpen.value = false;
  editingSource.value = null;
  sourceForm.value = {
    name: '',
    sourceType: 'rss',
    url: '',
    pollIntervalMinutes: 60,
    practiceAreasStr: '',
    jurisdictionsStr: '',
  };
}

function splitTags(str: string): string[] {
  return str
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function saveSource() {
  try {
    const dto = {
      name: sourceForm.value.name,
      sourceType: sourceForm.value.sourceType,
      url: sourceForm.value.url,
      pollIntervalMinutes: sourceForm.value.pollIntervalMinutes,
      practiceAreas: splitTags(sourceForm.value.practiceAreasStr),
      jurisdictions: splitTags(sourceForm.value.jurisdictionsStr),
    };
    if (editingSource.value) {
      await sentinelService.updateSource(
        editingSource.value.id,
        orgSlug.value,
        dto,
      );
    } else {
      await sentinelService.createSource(orgSlug.value, dto);
    }
    closeSourceModal();
    await loadSources();
  } catch (e) {
    sourcesError.value = (e as Error).message;
  }
}

async function toggleSource(src: SentinelSource, enabled: boolean) {
  await sentinelService.updateSource(src.id, orgSlug.value, { enabled });
  await loadSources();
}

async function removeSource(src: SentinelSource) {
  await sentinelService.deleteSource(src.id, orgSlug.value);
  await loadSources();
}

// ── Poll Now ─────────────────────────────────────────────────────────────
const pollingSourceId = ref<string | null>(null);

async function pollNow(src: SentinelSource) {
  if (!orgSlug.value || !user.value?.id) return;
  pollingSourceId.value = src.id;
  try {
    await sentinelService.pollNow(orgSlug.value, src.id, user.value.id);
  } finally {
    pollingSourceId.value = null;
  }
}

// ── Sync Triggers ────────────────────────────────────────────────────────
const syncingTriggers = ref(false);

async function syncTriggers() {
  if (!orgSlug.value) return;
  syncingTriggers.value = true;
  try {
    await sentinelService.syncTriggers(orgSlug.value);
  } finally {
    syncingTriggers.value = false;
  }
}

// ── Alerts state ──────────────────────────────────────────────────────
const alerts = ref<SentinelAlert[]>([]);
const alertsLoading = ref(false);
const alertsError = ref<string | null>(null);
const alertFilterStatus = ref('');
const alertFilterSeverity = ref('');
const expandedAlertId = ref<string | null>(null);
const alertDetails = ref<Record<string, AlertDetail>>({});

async function loadAlerts() {
  if (!orgSlug.value) return;
  alertsLoading.value = true;
  alertsError.value = null;
  try {
    alerts.value = await sentinelService.listAlerts(orgSlug.value, {
      status: (alertFilterStatus.value || undefined) as AlertStatus | undefined,
      severity: alertFilterSeverity.value || undefined,
    });
    newAlertCount.value = alerts.value.filter((a) => a.status === 'new').length;
  } catch (e) {
    alertsError.value = (e as Error).message;
  } finally {
    alertsLoading.value = false;
  }
}

async function toggleAlertExpand(id: string) {
  if (expandedAlertId.value === id) {
    expandedAlertId.value = null;
    return;
  }
  expandedAlertId.value = id;
  // Load detail if not cached
  if (!alertDetails.value[id]) {
    try {
      const detail = await sentinelService.getAlertDetail(id, orgSlug.value);
      alertDetails.value = { ...alertDetails.value, [id]: detail };
    } catch {
      // detail load failed — the expanded section will show loading
    }
  }
}

async function updateAlert(id: string, status: AlertStatus) {
  await sentinelService.updateAlertStatus(id, orgSlug.value, status);
  await loadAlerts();
}

function getPortfolioClientName(portfolioId: string): string {
  return portfolio.value.find((h) => h.id === portfolioId)?.client_name ?? portfolioId;
}

function severityBadgeColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'danger';
    case 'high':
      return 'warning';
    case 'medium':
      return 'primary';
    case 'low':
      return 'success';
    default:
      return 'medium';
  }
}

function urgencyBadgeColor(urgency: string): string {
  switch (urgency) {
    case 'immediate':
      return 'danger';
    case 'this_week':
      return 'warning';
    case 'informational':
      return 'medium';
    default:
      return 'medium';
  }
}

// ── Helpers ───────────────────────────────────────────────────────────
function sourceTypeBadge(type: string): string {
  switch (type) {
    case 'rss':
      return 'primary';
    case 'api':
      return 'success';
    case 'webpage':
      return 'warning';
    default:
      return 'medium';
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}
</script>

<style scoped>
.tab-content {
  padding: 0;
}

.tab-toolbar {
  display: flex;
  gap: 8px;
  padding: 12px 16px 4px;
}

.empty {
  padding: 24px;
  color: var(--ion-color-medium);
  text-align: center;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.tags ion-chip {
  height: 22px;
  font-size: 11px;
}

.source-error {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  color: var(--ion-color-danger);
  font-size: 13px;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--ion-color-danger-tint);
  color: var(--ion-color-danger-shade);
  font-size: 14px;
}

.signal-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.signal-header h2 {
  margin: 0;
}

.signal-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--ion-color-medium);
}

.signal-detail {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--ion-color-light);
}

.detail-section {
  margin-bottom: 12px;
}

.detail-section strong {
  display: block;
  margin-bottom: 4px;
  font-size: 13px;
  color: var(--ion-color-medium-shade);
}

.detail-section p {
  white-space: pre-wrap;
  word-break: break-word;
}

.holding-desc {
  color: var(--ion-color-medium-shade);
  font-size: 13px;
  white-space: pre-wrap;
}

.alert-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.alert-score {
  font-weight: 600;
  font-size: 13px;
  color: var(--ion-color-primary);
  margin-left: auto;
}

.alert-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--ion-color-medium);
}

.alert-detail {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--ion-color-light);
}

.detail-sections {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-sub {
  color: var(--ion-color-medium-shade);
  font-size: 13px;
}

.full-text {
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

.alert-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--ion-color-light);
}
</style>
