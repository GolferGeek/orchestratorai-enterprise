<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAscentekStore } from '@/stores/ascentek.store';
import { useLubeTechStore } from '@/stores/lube-tech.store';
import { useOemPartnerStore } from '@/stores/oem-partner.store';

const ascentekStore = useAscentekStore();
const lubeTechStore = useLubeTechStore();
const oemStore = useOemPartnerStore();

type OrgKey = 'ascentek' | 'lube-tech' | 'oem-partner';
type AscentekFileKey = 'formulations' | 'specs' | 'pricing' | 'partners' | 'transactions';
type LubeTechFileKey = 'production' | 'inventory' | 'batches' | 'quality-standards' | 'transactions';
type OemFileKey = 'purchase-orders' | 'spec-requirements' | 'order-history' | 'quality-complaints' | 'approved-suppliers' | 'transactions';

const selectedOrg = ref<OrgKey>('ascentek');
const selectedFile = ref<string>('formulations');

const orgFiles: Record<OrgKey, string[]> = {
  ascentek: ['formulations', 'specs', 'pricing', 'partners', 'transactions'],
  'lube-tech': ['production', 'inventory', 'batches', 'quality-standards', 'transactions'],
  'oem-partner': ['purchase-orders', 'spec-requirements', 'order-history', 'quality-complaints', 'approved-suppliers', 'transactions'],
};

const fileData = computed((): unknown[] => {
  if (selectedOrg.value === 'ascentek') {
    const key = selectedFile.value as AscentekFileKey;
    const map: Record<AscentekFileKey, unknown[]> = {
      formulations: ascentekStore.formulations,
      specs: ascentekStore.specs,
      pricing: ascentekStore.pricing,
      partners: ascentekStore.partners,
      transactions: ascentekStore.transactions,
    };
    return map[key] ?? [];
  }
  if (selectedOrg.value === 'lube-tech') {
    const key = selectedFile.value as LubeTechFileKey;
    const map: Record<LubeTechFileKey, unknown[]> = {
      production: lubeTechStore.production,
      inventory: lubeTechStore.inventory,
      batches: lubeTechStore.batches,
      'quality-standards': lubeTechStore.qualityStandards,
      transactions: lubeTechStore.transactions,
    };
    return map[key] ?? [];
  }
  if (selectedOrg.value === 'oem-partner') {
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
  if (selectedOrg.value === 'ascentek') return ascentekStore.loading;
  if (selectedOrg.value === 'lube-tech') return lubeTechStore.loading;
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
  if (selectedOrg.value !== 'lube-tech' || selectedFile.value !== 'batches') return false;
  const r = record as Record<string, unknown>;
  return lubeTechStore.qualityHoldBatches.includes(String(r.batchNumber ?? r.id ?? ''));
}

function formatJson(v: unknown): string {
  return JSON.stringify(v, null, 2);
}

const orgAccent: Record<OrgKey, string> = {
  ascentek: 'text-amber-400 border-amber-700/40',
  'lube-tech': 'text-green-400 border-green-700/40',
  'oem-partner': 'text-blue-400 border-blue-700/40',
};

onMounted(() => {
  // Data is loaded by parent stores already, but trigger re-fetch if empty
  if (ascentekStore.formulations.length === 0) ascentekStore.fetchAll();
  if (lubeTechStore.production.length === 0) lubeTechStore.fetchAll();
  if (oemStore.purchaseOrders.length === 0) oemStore.fetchAll();
});
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Org selector -->
    <div class="flex gap-1 p-3 border-b border-gray-700 flex-shrink-0">
      <button
        v-for="org in (['ascentek', 'lube-tech', 'oem-partner'] as OrgKey[])"
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
