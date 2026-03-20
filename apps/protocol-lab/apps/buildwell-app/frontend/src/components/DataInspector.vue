<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useBuildwellStore } from '@/stores/buildwell.store';
import { useAlloytechStore } from '@/stores/alloytech.store';
import { useApexOemStore } from '@/stores/apex-oem.store';

const buildwellStore = useBuildwellStore();
const alloytechStore = useAlloytechStore();
const oemStore = useApexOemStore();

type OrgKey = 'buildwell' | 'alloytech' | 'apex-oem';
type BuildwellFileKey = 'formulations' | 'specs' | 'pricing' | 'partners' | 'transactions';
type AlloytechFileKey = 'production' | 'inventory' | 'batches' | 'quality-standards' | 'transactions';
type OemFileKey = 'purchase-orders' | 'spec-requirements' | 'order-history' | 'quality-complaints' | 'approved-suppliers' | 'transactions';

const selectedOrg = ref<OrgKey>('buildwell');
const selectedFile = ref<string>('formulations');

const orgFiles: Record<OrgKey, string[]> = {
  buildwell: ['formulations', 'specs', 'pricing', 'partners', 'transactions'],
  'alloytech': ['production', 'inventory', 'batches', 'quality-standards', 'transactions'],
  'apex-oem': ['purchase-orders', 'spec-requirements', 'order-history', 'quality-complaints', 'approved-suppliers', 'transactions'],
};

const fileData = computed((): unknown[] => {
  if (selectedOrg.value === 'buildwell') {
    const key = selectedFile.value as BuildwellFileKey;
    const map: Record<BuildwellFileKey, unknown[]> = {
      formulations: buildwellStore.formulations,
      specs: buildwellStore.specs,
      pricing: buildwellStore.pricing,
      partners: buildwellStore.partners,
      transactions: buildwellStore.transactions,
    };
    return map[key] ?? [];
  }
  if (selectedOrg.value === 'alloytech') {
    const key = selectedFile.value as AlloytechFileKey;
    const map: Record<AlloytechFileKey, unknown[]> = {
      production: alloytechStore.production,
      inventory: alloytechStore.inventory,
      batches: alloytechStore.batches,
      'quality-standards': alloytechStore.qualityStandards,
      transactions: alloytechStore.transactions,
    };
    return map[key] ?? [];
  }
  if (selectedOrg.value === 'apex-oem') {
    const key = selectedFile.value as OemFileKey;
    const map: Record<OemFileKey, unknown[]> = {
      'purchase-orders': oemStore.purchaseOrders,
      'spec-requirements': oemStore.specRequirements,
      'order-history': oemStore.orderHistory,
      'quality-complaints': oemStore.qualityComplaints,
      'approved-suppliers': oemStore.approvedSuppliers,
      transactions: oemStore.transactions,
    };
    return map[key] ?? [];
  }
  return [];
});

const loading = computed(() => {
  if (selectedOrg.value === 'buildwell') return buildwellStore.loading;
  if (selectedOrg.value === 'alloytech') return alloytechStore.loading;
  return oemStore.loading;
});

function selectOrg(org: OrgKey): void {
  selectedOrg.value = org;
  selectedFile.value = orgFiles[org][0];
}

function selectFile(file: string): void {
  selectedFile.value = file;
}

function isQualityHoldBatch(record: unknown): boolean {
  if (selectedOrg.value !== 'alloytech' || selectedFile.value !== 'batches') return false;
  const r = record as Record<string, unknown>;
  return alloytechStore.qualityHoldBatches.includes(String(r.batchNumber ?? r.id ?? ''));
}

function formatJson(v: unknown): string {
  return JSON.stringify(v, null, 2);
}

const orgAccent: Record<OrgKey, string> = {
  buildwell: 'text-amber-400 border-amber-700/40',
  'alloytech': 'text-green-400 border-green-700/40',
  'apex-oem': 'text-blue-400 border-blue-700/40',
};

onMounted(() => {
  // Data is loaded by parent stores already, but trigger re-fetch if empty
  if (buildwellStore.formulations.length === 0) buildwellStore.fetchAll();
  if (alloytechStore.production.length === 0) alloytechStore.fetchAll();
  if (oemStore.purchaseOrders.length === 0) oemStore.fetchAll();
});
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Org selector -->
    <div class="flex gap-1 p-3 border-b border-gray-700 flex-shrink-0">
      <button
        v-for="org in (['buildwell', 'alloytech', 'apex-oem'] as OrgKey[])"
        :key="org"
        class="flex-1 text-xs py-1.5 rounded-lg border transition-colors"
        :class="[
          selectedOrg === org
            ? orgAccent[org] + ' bg-gray-700'
            : 'text-gray-500 border-gray-700 hover:bg-gray-700',
        ]"
        @click="selectOrg(org)"
      >
        {{ org }}
      </button>
    </div>

    <!-- File tabs -->
    <div class="flex gap-1 flex-wrap p-2 border-b border-gray-700 flex-shrink-0">
      <button
        v-for="file in orgFiles[selectedOrg]"
        :key="file"
        class="text-xs px-2 py-1 rounded transition-colors"
        :class="[
          selectedFile === file
            ? 'bg-gray-600 text-gray-100'
            : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700',
        ]"
        @click="selectFile(file)"
      >
        {{ file }}
      </button>
    </div>

    <!-- Records -->
    <div class="flex-1 overflow-y-auto p-3">
      <div v-if="loading" class="flex items-center justify-center h-32 text-gray-500 text-sm">
        Loading...
      </div>
      <div v-else-if="fileData.length === 0" class="flex items-center justify-center h-32 text-gray-600 text-sm">
        No data
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="(record, idx) in fileData"
          :key="idx"
          class="rounded-lg border text-xs overflow-hidden"
          :class="[
            isQualityHoldBatch(record)
              ? 'border-red-600 bg-red-900/10'
              : 'border-gray-700 bg-gray-800/50',
          ]"
        >
          <div
            v-if="isQualityHoldBatch(record)"
            class="px-3 py-1 bg-red-800/40 text-red-300 text-xs font-medium"
          >
            QUALITY HOLD
          </div>
          <pre class="p-3 text-gray-300 overflow-x-auto max-h-36 overflow-y-auto">{{ formatJson(record) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
