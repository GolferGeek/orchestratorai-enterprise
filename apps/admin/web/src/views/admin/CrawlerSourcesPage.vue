<template>
  <ion-page>
  <div class="detail-view">
    <div class="detail-header">
      <h2>Crawler Sources</h2>
      <div class="header-actions">
        <ion-button fill="solid" size="small" @click="openCreateModal">
          <ion-icon :icon="addOutline" slot="start" />
          Add Source
        </ion-button>
        <ion-button fill="clear" size="small" @click="fetchData" :disabled="loading">
          <ion-icon :icon="refreshOutline" slot="icon-only" />
        </ion-button>
      </div>
    </div>

    <div class="detail-body">
      <div class="loading-state" v-if="loading && sources.length === 0">
        <ion-spinner />
        <p>Loading crawler sources...</p>
      </div>

      <div class="empty-state" v-else-if="!loading && sources.length === 0">
        <ion-icon :icon="globeOutline" />
        <h3>No Crawler Sources</h3>
        <p>Add a source to start crawling content.</p>
      </div>

      <div v-else class="master-detail-container">
        <!-- Master: Source List -->
        <div class="master-panel">
          <div class="stats-banner" v-if="stats">
            <div class="stat">
              <span class="stat-value">{{ stats.totalSources }}</span>
              <span class="stat-label">Sources</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ stats.activeSources }}</span>
              <span class="stat-label">Active</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ formatNumber(stats.totalArticles) }}</span>
              <span class="stat-label">Articles</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ formatNumber(totalDedup) }}</span>
              <span class="stat-label">Deduped</span>
            </div>
          </div>

          <div class="list-controls">
            <ion-toggle v-model="showInactive" size="small">Show inactive</ion-toggle>
          </div>

          <ion-list class="source-list">
            <ion-item
              v-for="source in filteredSources"
              :key="source.id"
              button
              @click="selectSource(source)"
              :class="{ 'selected-source': selectedSource?.id === source.id }"
            >
              <div class="source-status-dot" :class="source.isActive ? 'dot-active' : 'dot-inactive'" slot="start" />
              <ion-label>
                <h2>{{ source.name }}</h2>
                <p class="source-url">{{ truncateUrl(source.url) }}</p>
                <p>
                  <ion-badge color="medium" class="type-badge">{{ source.sourceType }}</ion-badge>
                  <span class="article-count">{{ formatNumber(source.articleCount) }} articles</span>
                </p>
              </ion-label>
            </ion-item>
          </ion-list>
        </div>

        <!-- Detail: Selected Source -->
        <div class="detail-panel" v-if="selectedSource">
          <div class="source-detail-header">
            <div class="source-title-row">
              <h3>{{ selectedSource.name }}</h3>
              <div class="source-actions">
                <ion-button fill="clear" size="small" @click="openEditModal(selectedSource)">
                  <ion-icon :icon="pencilOutline" slot="icon-only" />
                </ion-button>
                <ion-button fill="clear" size="small" color="danger" @click="confirmDelete(selectedSource)">
                  <ion-icon :icon="trashOutline" slot="icon-only" />
                </ion-button>
              </div>
            </div>
            <div class="source-meta">
              <span class="meta-item">
                <ion-badge :color="selectedSource.isActive ? 'success' : 'medium'">
                  {{ selectedSource.isActive ? 'Active' : 'Inactive' }}
                </ion-badge>
              </span>
              <span class="meta-item mono">{{ selectedSource.sourceType }}</span>
              <span class="meta-item">Every {{ selectedSource.crawlFrequencyMinutes }}m</span>
              <span v-if="selectedSource.isTest" class="meta-item">
                <ion-badge color="warning">Test</ion-badge>
              </span>
            </div>
          </div>

          <!-- Info section -->
          <div class="section-card">
            <h4 class="section-title">Source Info</h4>
            <div class="info-grid">
              <div class="info-row">
                <span class="info-label">URL</span>
                <a :href="selectedSource.url" target="_blank" rel="noopener" class="info-value mono link">{{ selectedSource.url }}</a>
              </div>
              <div class="info-row" v-if="selectedSource.description">
                <span class="info-label">Description</span>
                <span class="info-value">{{ selectedSource.description }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Last Crawl</span>
                <span class="info-value">{{ selectedSource.lastCrawlAt ? formatDateTime(selectedSource.lastCrawlAt) : 'Never' }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Last Status</span>
                <span class="info-value">
                  <span v-if="selectedSource.lastCrawlStatus" :class="['status-badge', crawlStatusClass(selectedSource.lastCrawlStatus)]">
                    {{ selectedSource.lastCrawlStatus }}
                  </span>
                  <span v-else>—</span>
                </span>
              </div>
              <div class="info-row">
                <span class="info-label">Created</span>
                <span class="info-value">{{ formatDate(selectedSource.createdAt) }}</span>
              </div>
            </div>
          </div>

          <!-- Recent Articles -->
          <div class="section-card">
            <div class="section-title-row">
              <h4 class="section-title">Recent Articles</h4>
              <div class="detail-loading" v-if="detailLoading.articles">
                <ion-spinner name="dots" />
              </div>
            </div>
            <div class="empty-state small" v-if="!detailLoading.articles && articles.length === 0">
              <p>No articles found.</p>
            </div>
            <div class="table-container" v-else-if="articles.length > 0">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Published</th>
                    <th>First Seen</th>
                    <th>Dup</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="article in articles" :key="article.id">
                    <td>
                      <a :href="article.url" target="_blank" rel="noopener" class="link">
                        {{ article.title ?? article.url }}
                      </a>
                    </td>
                    <td>{{ article.publishedAt ? formatDate(article.publishedAt) : '—' }}</td>
                    <td>{{ formatDate(article.firstSeenAt) }}</td>
                    <td>
                      <ion-badge v-if="article.isDuplicate" color="warning">dup</ion-badge>
                      <span v-else class="text-muted">—</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Crawl History -->
          <div class="section-card">
            <div class="section-title-row">
              <h4 class="section-title">Crawl History</h4>
              <div class="detail-loading" v-if="detailLoading.crawls">
                <ion-spinner name="dots" />
              </div>
            </div>
            <div class="empty-state small" v-if="!detailLoading.crawls && crawls.length === 0">
              <p>No crawl history found.</p>
            </div>
            <div class="table-container" v-else-if="crawls.length > 0">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Status</th>
                    <th>Found</th>
                    <th>New</th>
                    <th>Dups</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="crawl in crawls" :key="crawl.id">
                    <td>{{ formatDateTime(crawl.startedAt) }}</td>
                    <td>
                      <span :class="['status-badge', crawlStatusClass(crawl.status)]">{{ crawl.status }}</span>
                    </td>
                    <td>{{ crawl.articlesFound }}</td>
                    <td>{{ crawl.articlesNew }}</td>
                    <td>{{ crawl.duplicatesExact }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Empty detail state -->
        <div class="detail-panel empty-details" v-else>
          <div class="empty-state">
            <ion-icon :icon="globeOutline" size="large" color="medium" />
            <h3>Select a source</h3>
            <p>Choose a crawler source to view details, articles, and crawl history.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Create / Edit Modal -->
    <ion-modal :is-open="modalOpen" @did-dismiss="closeModal">
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ editingSource ? 'Edit Source' : 'Add Source' }}</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="closeModal">Cancel</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="modal-content">
        <div class="form-body">
          <ion-item>
            <ion-label position="stacked">Name *</ion-label>
            <ion-input v-model="form.name" placeholder="My News Source" />
          </ion-item>
          <ion-item>
            <ion-label position="stacked">URL *</ion-label>
            <ion-input v-model="form.url" placeholder="https://example.com/feed.xml" type="url" />
          </ion-item>
          <ion-item>
            <ion-label position="stacked">Source Type</ion-label>
            <ion-select v-model="form.sourceType">
              <ion-select-option value="rss">RSS</ion-select-option>
              <ion-select-option value="atom">Atom</ion-select-option>
              <ion-select-option value="scraper">Scraper</ion-select-option>
              <ion-select-option value="api">API</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="stacked">Crawl Frequency (minutes)</ion-label>
            <ion-input v-model.number="form.crawlFrequencyMinutes" type="number" min="1" />
          </ion-item>
          <ion-item>
            <ion-label position="stacked">Description</ion-label>
            <ion-textarea v-model="form.description" :rows="2" placeholder="Optional description" />
          </ion-item>
          <ion-item>
            <ion-label>Active</ion-label>
            <ion-toggle v-model="form.isActive" slot="end" />
          </ion-item>
          <ion-item>
            <ion-label>Test Source</ion-label>
            <ion-toggle v-model="form.isTest" slot="end" />
          </ion-item>

          <div class="modal-actions">
            <ion-button expand="block" @click="saveSource" :disabled="saving">
              <ion-spinner v-if="saving" name="dots" />
              <span v-else>{{ editingSource ? 'Save Changes' : 'Create Source' }}</span>
            </ion-button>
          </div>
        </div>
      </ion-content>
    </ion-modal>
  </div>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import {
  IonButton, IonIcon, IonSpinner, IonList, IonItem, IonLabel, IonBadge,
  IonToggle, IonModal, IonHeader, IonToolbar, IonTitle, IonButtons,
  IonContent, IonInput, IonSelect, IonSelectOption, IonTextarea,
  toastController, alertController,
  IonPage,
} from '@ionic/vue';
import {
  refreshOutline, globeOutline, addOutline, pencilOutline, trashOutline,
} from 'ionicons/icons';
import {
  adminApiService,
  type CrawlerStats,
  type CrawlerSource,
  type CrawlerArticle,
  type SourceCrawl,
} from '@/services/admin-api.service';

const loading = ref(false);
const stats = ref<CrawlerStats | null>(null);
const sources = ref<CrawlerSource[]>([]);
const selectedSource = ref<CrawlerSource | null>(null);
const showInactive = ref(true);

const articles = ref<CrawlerArticle[]>([]);
const crawls = ref<SourceCrawl[]>([]);
const detailLoading = ref({ articles: false, crawls: false });

const modalOpen = ref(false);
const editingSource = ref<CrawlerSource | null>(null);
const saving = ref(false);

const defaultForm = (): Partial<CrawlerSource> => ({
  name: '',
  url: '',
  sourceType: 'rss',
  crawlFrequencyMinutes: 60,
  description: null,
  isActive: true,
  isTest: false,
});

const form = ref<Partial<CrawlerSource>>(defaultForm());

const totalDedup = computed(() => {
  if (!stats.value) return 0;
  const d = stats.value.totalDedup;
  return d.exact + d.crossSource + d.fuzzyTitle + d.phraseOverlap;
});

const filteredSources = computed(() => {
  if (showInactive.value) return sources.value;
  return sources.value.filter((s) => s.isActive);
});

function truncateUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname !== '/' ? u.pathname : '');
  } catch {
    return url.length > 50 ? url.slice(0, 50) + '…' : url;
  }
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

function crawlStatusClass(status: string): string {
  if (status === 'success' || status === 'completed') return 'status-active';
  if (status === 'running' || status === 'in_progress') return 'status-running';
  return 'status-inactive';
}

async function selectSource(source: CrawlerSource): Promise<void> {
  selectedSource.value = source;
  articles.value = [];
  crawls.value = [];

  detailLoading.value.articles = true;
  detailLoading.value.crawls = true;

  const [articlesResult, crawlsResult] = await Promise.allSettled([
    adminApiService.getCrawlerSourceArticles(source.id, { limit: 25 }),
    adminApiService.getCrawlerSourceCrawls(source.id, 20),
  ]);

  if (articlesResult.status === 'fulfilled') {
    articles.value = articlesResult.value;
  } else {
    const toast = await toastController.create({ message: 'Failed to load articles', duration: 3000, color: 'danger' });
    await toast.present();
  }
  detailLoading.value.articles = false;

  if (crawlsResult.status === 'fulfilled') {
    crawls.value = crawlsResult.value;
  } else {
    const toast = await toastController.create({ message: 'Failed to load crawl history', duration: 3000, color: 'danger' });
    await toast.present();
  }
  detailLoading.value.crawls = false;
}

function openCreateModal(): void {
  editingSource.value = null;
  form.value = defaultForm();
  modalOpen.value = true;
}

function openEditModal(source: CrawlerSource): void {
  editingSource.value = source;
  form.value = { ...source };
  modalOpen.value = true;
}

function closeModal(): void {
  modalOpen.value = false;
  editingSource.value = null;
  form.value = defaultForm();
}

async function saveSource(): Promise<void> {
  if (!form.value.name || !form.value.url) {
    const toast = await toastController.create({ message: 'Name and URL are required', duration: 3000, color: 'warning' });
    await toast.present();
    return;
  }

  saving.value = true;
  try {
    if (editingSource.value) {
      const updated = await adminApiService.updateCrawlerSource(editingSource.value.id, form.value);
      const idx = sources.value.findIndex((s) => s.id === editingSource.value!.id);
      if (idx !== -1) sources.value[idx] = updated;
      if (selectedSource.value?.id === updated.id) selectedSource.value = updated;
    } else {
      const created = await adminApiService.createCrawlerSource(form.value);
      sources.value.unshift(created);
    }
    closeModal();
    const toast = await toastController.create({
      message: editingSource.value ? 'Source updated' : 'Source created',
      duration: 2000,
      color: 'success',
    });
    await toast.present();
    await fetchStats();
  } catch (_err) {
    const toast = await toastController.create({ message: 'Failed to save source', duration: 3000, color: 'danger' });
    await toast.present();
  } finally {
    saving.value = false;
  }
}

async function confirmDelete(source: CrawlerSource): Promise<void> {
  const alert = await alertController.create({
    header: 'Delete Source',
    message: `Delete "${source.name}"? This cannot be undone.`,
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Delete',
        role: 'destructive',
        handler: () => deleteSource(source),
      },
    ],
  });
  await alert.present();
}

async function deleteSource(source: CrawlerSource): Promise<void> {
  try {
    await adminApiService.deleteCrawlerSource(source.id);
    sources.value = sources.value.filter((s) => s.id !== source.id);
    if (selectedSource.value?.id === source.id) selectedSource.value = null;
    await fetchStats();
    const toast = await toastController.create({ message: 'Source deleted', duration: 2000, color: 'success' });
    await toast.present();
  } catch (_err) {
    const toast = await toastController.create({ message: 'Failed to delete source', duration: 3000, color: 'danger' });
    await toast.present();
  }
}

async function fetchStats(): Promise<void> {
  const result = await adminApiService.getCrawlerStats();
  stats.value = result;
}

async function fetchData(): Promise<void> {
  loading.value = true;
  try {
    const [statsResult, sourcesResult] = await Promise.allSettled([
      adminApiService.getCrawlerStats(),
      adminApiService.getCrawlerSources(true),
    ]);

    if (statsResult.status === 'fulfilled') {
      stats.value = statsResult.value;
    } else {
      const toast = await toastController.create({ message: 'Failed to load stats', duration: 3000, color: 'danger' });
      await toast.present();
    }

    if (sourcesResult.status === 'fulfilled') {
      sources.value = sourcesResult.value;
    } else {
      const toast = await toastController.create({ message: 'Failed to load sources', duration: 3000, color: 'danger' });
      await toast.present();
    }
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
  align-items: center;
}

.detail-body {
  flex: 1;
  overflow-y: auto;
}

/* Master-Detail Layout */
.master-detail-container {
  display: grid;
  grid-template-columns: 320px 1fr;
  height: 100%;
  gap: 1rem;
  padding: 1rem;
}

.master-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow-y: auto;
  background: var(--ion-background-color);
  border-radius: 8px;
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  padding: 1rem;
}

.stats-banner {
  display: flex;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: linear-gradient(135deg, #2d6a4f 0%, #1b4332 100%);
  border-radius: 8px;
  color: white;
}

.stats-banner .stat {
  text-align: center;
  flex: 1;
}

.stats-banner .stat-value {
  display: block;
  font-size: 1.1rem;
  font-weight: 700;
}

.stats-banner .stat-label {
  font-size: 0.65rem;
  opacity: 0.9;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.list-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--dark-text-muted, #888);
}

.source-list {
  background: transparent;
  padding: 0;
}

.source-list ion-item {
  cursor: pointer;
  margin-bottom: 0.5rem;
  border-radius: 8px;
  --background: var(--ion-background-color);
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  transition: all 0.2s ease;
}

.source-list ion-item:hover {
  --background: var(--ion-color-step-50, var(--ion-color-light-tint));
  transform: translateX(2px);
}

.source-list ion-item.selected-source {
  --background: var(--ion-color-primary);
  --color: white;
  border-color: var(--ion-color-primary-shade);
  box-shadow: 0 2px 8px rgba(var(--ion-color-primary-rgb), 0.3);
}

.source-list ion-item.selected-source ion-label h2,
.source-list ion-item.selected-source ion-label p,
.source-list ion-item.selected-source .article-count {
  color: white;
}

.source-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 0.5rem;
  flex-shrink: 0;
}

.dot-active { background: #10b981; }
.dot-inactive { background: #6b7280; }

.source-url {
  font-size: 0.75rem;
  color: var(--dark-text-muted, #888);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.type-badge {
  font-size: 0.65rem;
  margin-right: 0.4rem;
}

.article-count {
  font-size: 0.75rem;
  color: var(--dark-text-muted, #888);
}

/* Detail Panel */
.detail-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  background: var(--ion-background-color);
  border-radius: 8px;
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  padding: 1rem;
}

.detail-panel.empty-details {
  justify-content: center;
  align-items: center;
}

.source-detail-header {
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
}

.source-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.source-title-row h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--ion-text-color, #333);
}

.source-actions {
  display: flex;
  gap: 0.25rem;
}

.source-meta {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  margin-top: 0.5rem;
  flex-wrap: wrap;
}

.meta-item {
  font-size: 0.8rem;
  color: var(--dark-text-muted, #888);
}

.section-card {
  background: var(--ion-card-background, var(--ion-background-color));
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  border-radius: 8px;
  padding: 0.875rem;
}

.section-title {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--dark-text-muted, #888);
}

.section-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-loading {
  display: flex;
  align-items: center;
}

.info-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.info-row {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
}

.info-label {
  width: 100px;
  flex-shrink: 0;
  font-weight: 500;
  color: var(--dark-text-muted, #888);
}

.info-value {
  color: var(--ion-text-color);
  word-break: break-all;
}

.table-container {
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  border-radius: 8px;
  overflow: hidden;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  background: var(--ion-toolbar-background, var(--ion-color-light));
  padding: 0.5rem 0.75rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.75rem;
  color: var(--dark-text-muted, #555);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
}

.data-table td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  font-size: 0.82rem;
  color: var(--ion-text-color);
  vertical-align: middle;
}

.data-table tr:last-child td {
  border-bottom: none;
}

.link {
  color: var(--ion-color-primary);
  text-decoration: none;
}

.link:hover {
  text-decoration: underline;
}

.mono {
  font-family: monospace;
  font-size: 0.8rem;
}

.text-muted {
  color: var(--dark-text-muted, #888);
}

.status-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.status-active {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.status-running {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.status-inactive {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--ion-color-medium);
}

.empty-state.small {
  padding: 1.5rem 1rem;
}

.empty-state ion-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.empty-state h3 {
  margin: 0 0 0.5rem;
  color: var(--ion-text-color, #555);
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: var(--ion-color-medium);
}

/* Modal */
.modal-content {
  --background: var(--ion-background-color);
}

.form-body {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.modal-actions {
  margin-top: 1rem;
}

@media (max-width: 992px) {
  .master-detail-container {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .master-panel {
    max-height: 40vh;
  }
}
</style>
