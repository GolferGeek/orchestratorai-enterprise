<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import OrgPanel from '@/components/OrgPanel.vue';
import ScenarioSelector from '@/components/ScenarioSelector.vue';
import MessageTimeline from '@/components/MessageTimeline.vue';
import PipelineView from '@/components/PipelineView.vue';
import DataInspector from '@/components/DataInspector.vue';
import LightningPaymentViz from '@/components/LightningPaymentViz.vue';
import QualityHoldAlert from '@/components/QualityHoldAlert.vue';
import AuctionBidView from '@/components/AuctionBidView.vue';
import HelpDrawer from '@/components/help/HelpDrawer.vue';
import ScenarioGuide from '@/components/help/ScenarioGuide.vue';
import ProviderPopover from '@/components/help/ProviderPopover.vue';
import CodeViewer from '@/components/help/CodeViewer.vue';
import { useAscentekStore } from '@/stores/ascentek.store';
import { useLubeTechStore } from '@/stores/lube-tech.store';
import { useOemPartnerStore } from '@/stores/oem-partner.store';
import { useTimelineStore } from '@/stores/timeline.store';
import { useScenarioStore } from '@/stores/scenario.store';
import { useHelpStore } from '@/stores/help.store';

type RightPanelTab = 'pipeline' | 'data' | 'lightning' | 'quality-hold' | 'auction';

const ascentekStore = useAscentekStore();
const lubeTechStore = useLubeTechStore();
const oemStore = useOemPartnerStore();
const timelineStore = useTimelineStore();
const scenarioStore = useScenarioStore();
const helpStore = useHelpStore();

// Keyboard shortcut: ? to toggle help drawer
function handleGlobalKeydown(e: KeyboardEvent) {
  if (e.key === '?' && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement)) {
    helpStore.toggleDrawer();
  }
}
onMounted(() => document.addEventListener('keydown', handleGlobalKeydown));
onUnmounted(() => document.removeEventListener('keydown', handleGlobalKeydown));

const rightTab = ref<RightPanelTab>('pipeline');

const selectedMessage = computed(() => timelineStore.getSelectedMessage());
const selectedTrace = computed(() => selectedMessage.value?.pipelineTrace ?? null);
const traceSteps = computed(() => selectedTrace.value?.steps ?? []);
const lastResult = computed(() => scenarioStore.lastResult?.result ?? null);
const lastScenarioId = computed(() => scenarioStore.lastResult?.scenario.id ?? null);

// Auto-switch tab based on scenario
const autoTabScenarios: Record<number, RightPanelTab> = {
  6: 'lightning',
  8: 'quality-hold',
  9: 'auction',
};

// Watch scenario store for completions
let prevScenarioId: number | null = null;

function checkScenarioChange(): void {
  const current = scenarioStore.lastResult?.scenario.id ?? null;
  if (current !== null && current !== prevScenarioId) {
    prevScenarioId = current;
    const tab = autoTabScenarios[current];
    if (tab) rightTab.value = tab;
  }
}

// Auto-switch to pipeline when a message is selected
timelineStore.$subscribe(() => {
  if (selectedMessage.value && !autoTabScenarios[lastScenarioId.value ?? 0]) {
    rightTab.value = 'pipeline';
  }
});

const loadError = ref<string | null>(null);

onMounted(async () => {
  try {
    await Promise.all([
      ascentekStore.fetchAll(),
      lubeTechStore.fetchAll(),
      oemStore.fetchAll(),
    ]);
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  }

  // Poll for scenario result changes
  setInterval(checkScenarioChange, 500);
});

const tabs: Array<{ id: RightPanelTab; label: string }> = [
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'data', label: 'Data Inspector' },
  { id: 'lightning', label: '⚡ Lightning' },
  { id: 'quality-hold', label: '⚠ Quality Hold' },
  { id: 'auction', label: '🏷 Auction' },
];
</script>

<template>
  <div class="flex flex-col h-full bg-gray-950 text-gray-100">

    <!-- Top: Scenario selector bar -->
    <ScenarioSelector />

    <!-- Scenario guide panel (slides down below scenario bar when info icon is clicked) -->
    <div v-if="helpStore.activeScenarioGuide !== null" class="px-3 pb-2">
      <ScenarioGuide
        :scenario-id="helpStore.activeScenarioGuide"
        ecosystem="ascentek"
        @close="helpStore.closeScenarioGuide()"
        @select-provider="(id: string) => helpStore.showProvider(id, 300, 200)"
      />
    </div>

    <!-- Help drawer (slides from right) -->
    <HelpDrawer
      v-if="helpStore.drawerOpen"
      @close="helpStore.closeDrawer()"
      @select-provider="(id: string) => { helpStore.closeDrawer(); helpStore.showProvider(id, 300, 200); }"
    />

    <!-- Provider popover (floating) -->
    <ProviderPopover
      v-if="helpStore.activeProvider"
      :provider-id="helpStore.activeProvider"
      :anchor-x="helpStore.popoverX"
      :anchor-y="helpStore.popoverY"
      @close="helpStore.closeProvider()"
      @select-provider="(id: string) => helpStore.showProvider(id, helpStore.popoverX, helpStore.popoverY)"
      @select-scenario="(id: number) => { helpStore.closeProvider(); helpStore.toggleScenarioGuide(id); }"
      @view-code="helpStore.showCode($event)"
    />

    <!-- Code viewer (modal overlay) -->
    <div v-if="helpStore.activeCodeRef" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="helpStore.closeCode()">
      <div class="w-[700px] max-w-[90vw] max-h-[80vh]">
        <CodeViewer
          :code-ref="helpStore.activeCodeRef"
          @close="helpStore.closeCode()"
        />
      </div>
    </div>

    <!-- Load error banner -->
    <div v-if="loadError" class="px-4 py-2 bg-red-950/50 border-b border-red-900/50 text-xs text-red-400">
      Backend load error: {{ loadError }} — ensure the Ascentek backend is running on port 6408
    </div>

    <!-- Main content area -->
    <div class="flex-1 flex flex-col min-h-0 overflow-hidden">

      <!-- Top half: Three org panels -->
      <div class="flex gap-3 p-3 h-[42%] min-h-0">
        <div class="flex-1 min-w-0">
          <OrgPanel
            org-name="OEM Partner"
            org-id="oem-partner"
            role="External Customer"
            identity-provider="oauth-jwt"
            :trust-score="oemStore.trustScore"
            :trust-level="oemStore.trustLevel"
            :circuit-breaker-state="oemStore.circuitBreakerState"
            :messages="oemStore.messages"
            accent-color="blue"
            :loading="oemStore.loading"
          />
        </div>

        <div class="flex-1 min-w-0">
          <OrgPanel
            org-name="Ascentek"
            org-id="ascentek"
            role="Lubricant Manufacturer"
            identity-provider="did"
            :trust-score="ascentekStore.trustScore"
            :trust-level="ascentekStore.trustLevel"
            :circuit-breaker-state="ascentekStore.circuitBreakerState"
            :messages="ascentekStore.messages"
            accent-color="amber"
            :loading="ascentekStore.loading"
          />
        </div>

        <div class="flex-1 min-w-0">
          <OrgPanel
            org-name="Lube-Tech"
            org-id="lube-tech"
            role="Contract Manufacturer"
            identity-provider="local-keys"
            :trust-score="lubeTechStore.trustScore"
            :trust-level="lubeTechStore.trustLevel"
            :circuit-breaker-state="lubeTechStore.circuitBreakerState"
            :messages="lubeTechStore.messages"
            accent-color="green"
            :loading="lubeTechStore.loading"
          />
        </div>
      </div>

      <!-- Bottom half: Timeline + tabbed right panel -->
      <div class="flex gap-3 px-3 pb-3 flex-1 min-h-0 overflow-hidden">

        <!-- Message timeline (left 60%) -->
        <div class="w-[60%] min-h-0 border border-gray-700/50 rounded-lg overflow-hidden bg-gray-900/50">
          <MessageTimeline />
        </div>

        <!-- Right panel: Tabbed views (40%) -->
        <div class="flex-1 min-h-0 min-w-0 border border-gray-700/50 rounded-lg overflow-hidden bg-gray-900/50 flex flex-col">

          <!-- Tab bar -->
          <div class="flex border-b border-gray-700/50 bg-gray-900/80 overflow-x-auto">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              :class="[
                'px-3 py-2 text-xs font-medium whitespace-nowrap tracking-wide transition-colors border-b-2',
                rightTab === tab.id
                  ? 'text-amber-400 border-amber-500'
                  : 'text-gray-500 border-transparent hover:text-gray-300',
              ]"
              @click="rightTab = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>

          <!-- Tab content -->
          <div class="flex-1 min-h-0 overflow-hidden">
            <PipelineView v-if="rightTab === 'pipeline'" class="h-full" />

            <div v-else-if="rightTab === 'data'" class="h-full">
              <DataInspector class="h-full" />
            </div>

            <div v-else-if="rightTab === 'lightning'" class="h-full overflow-y-auto p-4">
              <div v-if="!selectedTrace" class="text-sm text-gray-600 text-center py-8">
                Run scenario 6 (Purchase Order) to see Lightning payment visualization.
              </div>
              <LightningPaymentViz v-else :steps="traceSteps" />
            </div>

            <div v-else-if="rightTab === 'quality-hold'" class="h-full overflow-y-auto p-4">
              <div v-if="!selectedTrace" class="text-sm text-gray-600 text-center py-8">
                Run scenario 8 (Quality Hold) to see quality hold alerts.
              </div>
              <QualityHoldAlert
                v-else
                :steps="traceSteps"
                :result="lastResult && lastScenarioId === 8 ? lastResult as Record<string, unknown> : undefined"
              />
            </div>

            <div v-else-if="rightTab === 'auction'" class="h-full overflow-y-auto p-4">
              <div v-if="!selectedTrace" class="text-sm text-gray-600 text-center py-8">
                Run scenario 9 (Competitive Bid) to see auction bid view.
              </div>
              <AuctionBidView
                v-else
                :steps="traceSteps"
                :result="lastResult && lastScenarioId === 9 ? lastResult as Record<string, unknown> : undefined"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
