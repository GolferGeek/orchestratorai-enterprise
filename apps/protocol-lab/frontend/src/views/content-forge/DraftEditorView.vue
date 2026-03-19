<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useContentForgeStore } from '../../stores/content-forge.store';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';

const route = useRoute();
const router = useRouter();
const store = useContentForgeStore();

const editTitle = ref('');
const editContent = ref('');
const saveError = ref<string | null>(null);
const saving = ref(false);

async function loadDraft() {
  const id = route.params.id as string;
  await store.fetchDraft(id);
  if (store.currentDraft) {
    editTitle.value = store.currentDraft.title;
    editContent.value = store.currentDraft.content;
  }
}

onMounted(async () => {
  await loadDraft();
});

watch(() => store.currentDraft, (draft) => {
  if (draft) {
    editTitle.value = draft.title;
    editContent.value = draft.content;
  }
});

async function handleSave() {
  const id = route.params.id as string;
  saveError.value = null;
  saving.value = true;
  try {
    await store.updateDraft(id, {
      title: editTitle.value,
      content: editContent.value,
    });
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}

async function handleDelete() {
  const id = route.params.id as string;
  try {
    await store.deleteDraft(id);
    router.push('/apps/content-forge/drafts');
  } catch {
    // Error captured in store
  }
}

function statusBadge(status: string): string {
  switch (status) {
    case 'draft': return 'bg-gray-700 text-gray-300';
    case 'review': return 'bg-yellow-900 text-yellow-300';
    case 'published': return 'bg-green-900 text-green-300';
    default: return 'bg-gray-700 text-gray-300';
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <button class="text-gray-400 hover:text-white" @click="router.push('/apps/content-forge/drafts')">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 class="text-2xl font-bold text-white">Edit Draft</h1>
        <span v-if="store.currentDraft" :class="['text-xs px-2 py-0.5 rounded', statusBadge(store.currentDraft.status)]">
          {{ store.currentDraft.status }}
        </span>
      </div>
      <div class="flex gap-2">
        <button class="btn-primary text-sm" :disabled="saving" @click="handleSave">
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
        <button class="btn-secondary text-sm text-red-400 hover:text-red-300" @click="handleDelete">Delete</button>
      </div>
    </div>

    <div v-if="store.error" class="card border border-red-500 flex items-center justify-between gap-4">
      <p class="text-red-400 text-sm">{{ store.error }}</p>
      <button class="btn-secondary text-sm shrink-0" @click="loadDraft">Retry</button>
    </div>

    <div v-if="saveError" class="card border border-red-500">
      <p class="text-red-400 text-sm">{{ saveError }}</p>
    </div>

    <LoadingSpinner v-if="store.loading && !store.currentDraft" label="Loading draft..." />

    <template v-else-if="store.currentDraft">
      <div class="card">
        <label class="block text-xs text-gray-400 mb-1">Title</label>
        <input v-model="editTitle" type="text" class="input-field w-full text-lg" />
      </div>

      <div v-if="store.currentDraft.sources.length > 0" class="flex gap-2 flex-wrap">
        <span
          v-for="(source, idx) in store.currentDraft.sources"
          :key="idx"
          class="text-xs bg-gray-700 text-gray-400 px-2 py-1 rounded"
        >
          {{ source.agentId }} ({{ source.dataType }})
        </span>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[calc(100vh-300px)]">
        <div class="card flex flex-col">
          <p class="text-xs text-gray-400 mb-2">Markdown Editor</p>
          <textarea
            v-model="editContent"
            class="flex-1 bg-gray-900 text-gray-200 font-mono text-sm p-3 rounded-lg border border-gray-700 focus:border-protocol-primary focus:outline-none resize-none"
            placeholder="Write your content in markdown..."
          />
        </div>
        <div class="card flex flex-col">
          <p class="text-xs text-gray-400 mb-2">Preview</p>
          <pre class="flex-1 bg-gray-900 text-gray-300 text-sm p-3 rounded-lg border border-gray-700 overflow-auto whitespace-pre-wrap font-sans">{{ editContent }}</pre>
        </div>
      </div>
    </template>

    <EmptyState
      v-else-if="!store.loading && !store.error"
      title="Draft Not Found"
      message="The requested draft could not be found. It may have been deleted."
      actionLabel="Back to Drafts"
      actionRoute="/apps/content-forge/drafts"
    />
  </div>
</template>
