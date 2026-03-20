<script setup lang="ts">
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useTimelineStore } from '@/stores/timeline.store';
import { ORG_DATA_FILES } from '@/services/api';

const timelineStore = useTimelineStore();
const { selectedMessage } = storeToRefs(timelineStore);

interface LoadedFile {
  org: string;
  label: string;
  data: unknown;
  loading: boolean;
  error: string | null;
}

const loadedFiles = ref<Map<string, LoadedFile>>(new Map());
const selectedFileKey = ref<string | null>(null);

const selectedData = computed(() => {
  if (!selectedFileKey.value) return null;
  return loadedFiles.value.get(selectedFileKey.value) ?? null;
});

// Group files by org
const filesByOrg = computed(() => {
  const groups: Record<string, typeof ORG_DATA_FILES> = {};
  for (const f of ORG_DATA_FILES) {
    if (!groups[f.org]) groups[f.org] = [];
    groups[f.org].push(f);
  }
  return groups;
});

function fileKey(org: string, label: string): string {
  return `${org}::${label}`;
}

async function selectFile(org: string, label: string) {
  const key = fileKey(org, label);
  selectedFileKey.value = key;

  if (loadedFiles.value.has(key)) return;

  const filedef = ORG_DATA_FILES.find((f) => f.org === org && f.label === label);
  if (!filedef) return;

  const entry: LoadedFile = { org, label, data: null, loading: true, error: null };
  loadedFiles.value.set(key, entry);

  try {
    const data = await filedef.fetch();
    loadedFiles.value.set(key, { ...entry, data, loading: false });
  } catch (e) {
    loadedFiles.value.set(key, { ...entry, loading: false, error: e instanceof Error ? e.message : String(e) });
  }
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// Determine if a record was involved in the last scenario result
function isHighlighted(record: unknown): boolean {
  if (!selectedMessage.value) return false;
  const result = selectedMessage.value.result;
  const resultStr = JSON.stringify(result ?? '');
  const recordStr = JSON.stringify(record);

  // Check if any ID from the record appears in the result
  if (typeof record === 'object' && record !== null) {
    const obj = record as Record<string, unknown>;
    for (const val of Object.values(obj)) {
      if (typeof val === 'string' && val.length > 4 && resultStr.includes(val)) {
        return true;
      }
    }
  }
  return resultStr.includes(recordStr.slice(0, 30));
}

const orgColorClass = (org: string): string => {
  if (org.includes('FCS')) return 'text-blue-400';
  if (org.includes('Prairie Ridge Credit')) return 'text-emerald-400';
  if (org.includes('Central Farm Bank')) return 'text-amber-400';
  return 'text-slate-400';
};

const orgBgClass = (org: string): string => {
  if (org.includes('FCS')) return 'bg-blue-950/20 border-blue-800/30';
  if (org.includes('Prairie Ridge Credit')) return 'bg-emerald-950/20 border-emerald-800/30';
  if (org.includes('Central Farm Bank')) return 'bg-amber-950/20 border-amber-800/30';
  return 'bg-slate-900 border-slate-700';
};
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="px-3 py-2 border-b border-slate-700/50 bg-slate-900/50 flex items-center justify-between">
      <span class="text-xs font-semibold text-slate-300 tracking-wide">DATA INSPECTOR</span>
      <span v-if="selectedMessage" class="text-xxs text-slate-500">
        Highlighting S-{{ selectedMessage.scenarioId }} data
      </span>
    </div>

    <div class="flex flex-1 min-h-0 overflow-hidden">
      <!-- Tree sidebar -->
      <div class="w-44 flex-shrink-0 border-r border-slate-700/50 overflow-y-auto bg-slate-900/30">
        <div v-for="(files, org) in filesByOrg" :key="org" class="mb-1">
          <!-- Org header -->
          <div :class="['px-2 py-1.5 border-b border-slate-800/50 sticky top-0 z-10', orgBgClass(org)]">
            <span :class="['text-xxs font-bold uppercase tracking-wide', orgColorClass(org)]">
              {{ org }}
            </span>
          </div>

          <!-- File entries -->
          <div
            v-for="file in files"
            :key="file.label"
            :class="[
              'px-3 py-1.5 cursor-pointer text-xxs font-mono truncate transition-colors',
              selectedFileKey === fileKey(file.org, file.label)
                ? 'bg-slate-700/50 text-slate-100'
                : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200',
            ]"
            @click="selectFile(file.org, file.label)"
          >
            {{ file.label }}
          </div>
        </div>
      </div>

      <!-- Content panel -->
      <div class="flex-1 overflow-y-auto min-w-0">
        <!-- No file selected -->
        <div v-if="!selectedFileKey" class="flex items-center justify-center h-full">
          <div class="text-center">
            <div class="text-2xl mb-2">📁</div>
            <p class="text-xs text-slate-500">Select a file to inspect</p>
          </div>
        </div>

        <!-- Loading -->
        <div v-else-if="selectedData?.loading" class="flex items-center justify-center h-32">
          <div class="text-xs text-slate-500 flex items-center gap-2">
            <div class="w-4 h-4 border border-slate-500 border-t-slate-200 rounded-full animate-spin" />
            Loading...
          </div>
        </div>

        <!-- Error -->
        <div v-else-if="selectedData?.error" class="p-3">
          <div class="text-xs text-red-400 bg-red-950/20 p-2 rounded border border-red-900/50">
            {{ selectedData.error }}
          </div>
        </div>

        <!-- Array data — show records -->
        <div v-else-if="Array.isArray(selectedData?.data)" class="divide-y divide-slate-800/50">
          <div class="px-3 py-1.5 bg-slate-900/50 flex items-center justify-between sticky top-0">
            <span class="text-xxs text-slate-400">{{ (selectedData?.data as unknown[]).length }} records</span>
            <span v-if="selectedMessage" class="text-xxs text-slate-600">
              highlighted = involved in S-{{ selectedMessage.scenarioId }}
            </span>
          </div>

          <div
            v-for="(record, idx) in (selectedData?.data as unknown[])"
            :key="idx"
            :class="[
              'px-3 py-2 transition-colors',
              isHighlighted(record) ? 'bg-yellow-950/30 border-l-2 border-l-yellow-500' : 'hover:bg-slate-800/20',
            ]"
          >
            <div v-if="isHighlighted(record)" class="flex items-center gap-1.5 mb-1">
              <span class="w-1.5 h-1.5 rounded-full bg-yellow-500" />
              <span class="text-xxs text-yellow-500 font-semibold">Involved in scenario</span>
            </div>
            <pre class="text-xxs font-mono text-slate-300 whitespace-pre-wrap break-all leading-relaxed">{{ formatJson(record) }}</pre>
          </div>
        </div>

        <!-- Object / other data -->
        <div v-else-if="selectedData?.data" class="p-3">
          <pre class="text-xxs font-mono text-slate-300 whitespace-pre-wrap break-all leading-relaxed">{{ formatJson(selectedData.data) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
