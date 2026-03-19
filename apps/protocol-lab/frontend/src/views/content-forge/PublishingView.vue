<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useContentForgeStore } from '../../stores/content-forge.store';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import type { Draft } from '../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ContentType = 'blog' | 'social' | 'newsletter';
type PublishStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';
type PublishTarget = 'blog' | 'linkedin' | 'newsletter';

interface PublishingEntry {
  id: string;
  title: string;
  contentType: ContentType;
  createdAt: string;
  scheduledDate: string | null;
  status: PublishStatus;
  targets: PublishTarget[];
}

interface SchedulerState {
  scheduledDate: string;
  targets: Record<PublishTarget, boolean>;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const store = useContentForgeStore();

// ---------------------------------------------------------------------------
// Publishing queue — derived from store drafts
// ---------------------------------------------------------------------------

const contentTypeMap: ContentType[] = ['blog', 'social', 'newsletter'];

function draftToEntry(draft: Draft): PublishingEntry {
  const types = contentTypeMap;
  const idx = Math.abs(draft.id.charCodeAt(0)) % types.length;
  return {
    id: draft.id,
    title: draft.title,
    contentType: types[idx],
    createdAt: draft.createdAt,
    scheduledDate: null,
    status: draft.status === 'published' ? 'published' : 'draft',
    targets: [],
  };
}

const publishingQueue = ref<PublishingEntry[]>([]);

onMounted(async () => {
  await store.fetchDrafts();
  publishingQueue.value = store.drafts.map(draftToEntry);
});

// ---------------------------------------------------------------------------
// Summary counts
// ---------------------------------------------------------------------------

const counts = computed(() => {
  const queue = publishingQueue.value;
  return {
    draft: queue.filter((e) => e.status === 'draft').length,
    scheduled: queue.filter((e) => e.status === 'scheduled').length,
    publishing: queue.filter((e) => e.status === 'publishing').length,
    published: queue.filter((e) => e.status === 'published').length,
    failed: queue.filter((e) => e.status === 'failed').length,
  };
});

// ---------------------------------------------------------------------------
// Scheduler panel state (inline per-row)
// ---------------------------------------------------------------------------

const schedulingId = ref<string | null>(null);

function defaultSchedulerState(): SchedulerState {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return {
    scheduledDate: tomorrow.toISOString().slice(0, 16), // "YYYY-MM-DDTHH:MM"
    targets: { blog: false, linkedin: false, newsletter: false },
  };
}

const schedulerState = ref<SchedulerState>(defaultSchedulerState());

function openScheduler(id: string) {
  schedulingId.value = id;
  schedulerState.value = defaultSchedulerState();
}

function cancelScheduler() {
  schedulingId.value = null;
}

function confirmSchedule(entry: PublishingEntry) {
  const selectedTargets = (Object.keys(schedulerState.value.targets) as PublishTarget[]).filter(
    (t) => schedulerState.value.targets[t],
  );
  if (selectedTargets.length === 0) return;

  entry.scheduledDate = schedulerState.value.scheduledDate;
  entry.targets = selectedTargets;
  entry.status = 'scheduled';
  schedulingId.value = null;
}

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function typeBadgeClass(type: ContentType): string {
  switch (type) {
    case 'blog':
      return 'bg-indigo-900 text-indigo-300';
    case 'social':
      return 'bg-purple-900 text-purple-300';
    case 'newsletter':
      return 'bg-cyan-900 text-cyan-300';
  }
}

function statusBadgeClass(status: PublishStatus): string {
  switch (status) {
    case 'draft':
      return 'bg-gray-700 text-gray-300';
    case 'scheduled':
      return 'bg-blue-900 text-blue-300';
    case 'publishing':
      return 'bg-yellow-900 text-yellow-300';
    case 'published':
      return 'bg-green-900 text-green-300';
    case 'failed':
      return 'bg-red-900 text-red-300';
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold text-white">Publishing Queue</h1>
      <p class="text-gray-400 text-sm mt-1">Schedule and track content across publishing channels</p>
    </div>

    <!-- Summary bar -->
    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      <div class="bg-gray-800 rounded-lg px-4 py-3 flex flex-col gap-1">
        <span class="text-xs text-gray-400 uppercase tracking-wide">Drafts</span>
        <span class="text-2xl font-bold text-gray-200">{{ counts.draft }}</span>
      </div>
      <div class="bg-gray-800 rounded-lg px-4 py-3 flex flex-col gap-1">
        <span class="text-xs text-blue-400 uppercase tracking-wide">Scheduled</span>
        <span class="text-2xl font-bold text-blue-300">{{ counts.scheduled }}</span>
      </div>
      <div class="bg-gray-800 rounded-lg px-4 py-3 flex flex-col gap-1">
        <span class="text-xs text-yellow-400 uppercase tracking-wide">Publishing</span>
        <span class="text-2xl font-bold text-yellow-300">{{ counts.publishing }}</span>
      </div>
      <div class="bg-gray-800 rounded-lg px-4 py-3 flex flex-col gap-1">
        <span class="text-xs text-green-400 uppercase tracking-wide">Published</span>
        <span class="text-2xl font-bold text-green-300">{{ counts.published }}</span>
      </div>
      <div class="bg-gray-800 rounded-lg px-4 py-3 flex flex-col gap-1">
        <span class="text-xs text-red-400 uppercase tracking-wide">Failed</span>
        <span class="text-2xl font-bold text-red-300">{{ counts.failed }}</span>
      </div>
    </div>

    <!-- Error -->
    <div v-if="store.error" class="card border border-red-500 flex items-center justify-between gap-4">
      <p class="text-red-400 text-sm">{{ store.error }}</p>
      <button class="btn-secondary text-sm shrink-0" @click="store.fetchDrafts()">Retry</button>
    </div>

    <!-- Loading -->
    <LoadingSpinner v-if="store.loading" label="Loading publishing queue..." />

    <!-- Empty -->
    <EmptyState
      v-else-if="publishingQueue.length === 0 && !store.error"
      title="No Publishing Queue"
      message="No drafts ready for publishing. Create drafts first to populate the publishing queue."
      actionLabel="Go to Drafts"
      actionRoute="/apps/content-forge/drafts"
    />

    <!-- Table -->
    <div v-else class="overflow-x-auto rounded-lg border border-gray-700">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-gray-900 text-left">
            <th class="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Title</th>
            <th class="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Type</th>
            <th class="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
              Created
            </th>
            <th class="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
              Scheduled
            </th>
            <th class="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
            <th class="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Actions</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="entry in publishingQueue" :key="entry.id">
            <!-- Main row -->
            <tr
              class="border-t border-gray-700 bg-gray-800 hover:bg-gray-700 transition-colors"
              :class="{ 'border-b-0': schedulingId === entry.id }"
            >
              <!-- Title -->
              <td class="px-4 py-3 text-gray-200 max-w-xs">
                <span class="line-clamp-2 leading-snug">{{ entry.title }}</span>
                <div v-if="entry.targets.length > 0" class="flex flex-wrap gap-1 mt-1">
                  <span
                    v-for="target in entry.targets"
                    :key="target"
                    class="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"
                  >
                    {{ target }}
                  </span>
                </div>
              </td>

              <!-- Type badge -->
              <td class="px-4 py-3 whitespace-nowrap">
                <span :class="['text-xs px-2 py-0.5 rounded font-medium', typeBadgeClass(entry.contentType)]">
                  {{ entry.contentType }}
                </span>
              </td>

              <!-- Created date -->
              <td class="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                {{ formatDate(entry.createdAt) }}
              </td>

              <!-- Scheduled date -->
              <td class="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                {{ formatDate(entry.scheduledDate) }}
              </td>

              <!-- Status badge -->
              <td class="px-4 py-3 whitespace-nowrap">
                <span :class="['text-xs px-2 py-0.5 rounded font-medium capitalize', statusBadgeClass(entry.status)]">
                  {{ entry.status }}
                </span>
              </td>

              <!-- Actions -->
              <td class="px-4 py-3 whitespace-nowrap">
                <button
                  v-if="entry.status === 'draft' || entry.status === 'failed'"
                  class="btn-primary text-xs px-3 py-1"
                  @click="openScheduler(entry.id)"
                >
                  Schedule
                </button>
                <button
                  v-else-if="entry.status === 'scheduled'"
                  class="btn-secondary text-xs px-3 py-1"
                  @click="openScheduler(entry.id)"
                >
                  Reschedule
                </button>
                <span v-else class="text-gray-600 text-xs">—</span>
              </td>
            </tr>

            <!-- Inline scheduler panel -->
            <tr v-if="schedulingId === entry.id" :key="`${entry.id}-scheduler`" class="border-t-0">
              <td colspan="6" class="bg-gray-800 px-6 pb-4">
                <div class="border border-gray-600 rounded-lg p-4 space-y-4">
                  <h4 class="text-sm font-semibold text-gray-200">Schedule Publication</h4>

                  <!-- Date/time picker -->
                  <div class="flex flex-col gap-1">
                    <label class="text-xs text-gray-400">Date &amp; Time</label>
                    <input
                      v-model="schedulerState.scheduledDate"
                      type="datetime-local"
                      class="input-field w-64 text-sm"
                    />
                  </div>

                  <!-- Target checkboxes -->
                  <div class="flex flex-col gap-1">
                    <label class="text-xs text-gray-400">Publish to</label>
                    <div class="flex flex-wrap gap-4 mt-1">
                      <label class="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
                        <input
                          v-model="schedulerState.targets.blog"
                          type="checkbox"
                          class="w-4 h-4 rounded border-gray-600 bg-gray-700 text-protocol-primary focus:ring-protocol-primary"
                        />
                        Blog
                      </label>
                      <label class="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
                        <input
                          v-model="schedulerState.targets.linkedin"
                          type="checkbox"
                          class="w-4 h-4 rounded border-gray-600 bg-gray-700 text-protocol-primary focus:ring-protocol-primary"
                        />
                        LinkedIn
                      </label>
                      <label class="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
                        <input
                          v-model="schedulerState.targets.newsletter"
                          type="checkbox"
                          class="w-4 h-4 rounded border-gray-600 bg-gray-700 text-protocol-primary focus:ring-protocol-primary"
                        />
                        Newsletter
                      </label>
                    </div>
                  </div>

                  <!-- Validation message -->
                  <p
                    v-if="
                      !schedulerState.targets.blog &&
                      !schedulerState.targets.linkedin &&
                      !schedulerState.targets.newsletter
                    "
                    class="text-xs text-yellow-400"
                  >
                    Select at least one publishing target.
                  </p>

                  <!-- Buttons -->
                  <div class="flex gap-3 pt-1">
                    <button
                      class="btn-primary text-sm"
                      :disabled="
                        !schedulerState.targets.blog &&
                        !schedulerState.targets.linkedin &&
                        !schedulerState.targets.newsletter
                      "
                      @click="confirmSchedule(entry)"
                    >
                      Confirm Schedule
                    </button>
                    <button class="btn-secondary text-sm" @click="cancelScheduler">Cancel</button>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>
