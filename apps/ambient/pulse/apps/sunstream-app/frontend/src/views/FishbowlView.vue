<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import ScenarioSelector from '@/components/ScenarioSelector.vue';
import OrgPanel from '@/components/OrgPanel.vue';
import MessageTimeline from '@/components/MessageTimeline.vue';
import PipelineView from '@/components/PipelineView.vue';
import DataInspector from '@/components/DataInspector.vue';
import HelpDrawer from '@/components/help/HelpDrawer.vue';
import ScenarioGuide from '@/components/help/ScenarioGuide.vue';
import ProviderPopover from '@/components/help/ProviderPopover.vue';
import CodeViewer from '@/components/help/CodeViewer.vue';
import { useFcsStore } from '@/stores/fcs.store';
import { useSunstreamStore } from '@/stores/sunstream.store';
import { useAgribankStore } from '@/stores/agribank.store';
import { useTimelineStore } from '@/stores/timeline.store';
import { useHelpStore } from '@/stores/help.store';

const fcsStore = useFcsStore();
const sunstreamStore = useSunstreamStore();
const agribankStore = useAgribankStore();
const timelineStore = useTimelineStore();
const helpStore = useHelpStore();

// Keyboard shortcut: ? to toggle help drawer
function handleGlobalKeydown(e: KeyboardEvent) {
  if (e.key === '?' && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement)) {
    helpStore.toggleDrawer();
  }
}
onMounted(() => document.addEventListener('keydown', handleGlobalKeydown));
onUnmounted(() => document.removeEventListener('keydown', handleGlobalKeydown));

const { loans, borrowers, circuitBreakerSunstream: fcsCB, trustTowardSunstream: fcsTrust } = storeToRefs(fcsStore);
const { services, associations, circuitBreakerFcs, trustTowardFcs } = storeToRefs(sunstreamStore);
const { ratings, circuitBreakerSunstream: agribankCB, trustTowardSunstream: agribankTrust } = storeToRefs(agribankStore);
const { messages, selectedMessage } = storeToRefs(timelineStore);

// Right panel tab: pipeline or data
const rightTab = ref<'pipeline' | 'data'>('pipeline');

// Auto-switch to pipeline when a message is selected
timelineStore.$subscribe(() => {
  if (selectedMessage.value) {
    rightTab.value = 'pipeline';
  }
});

// Build recent messages for each org panel from timeline
const fcsMessages = computed(() =>
  messages.value
    .filter((m) => m.source.includes('fcs') || m.target.includes('fcs'))
    .slice(0, 5)
    .map((m) => ({
      id: m.id,
      method: m.method,
      source: m.source,
      target: m.target,
      timestamp: m.timestamp,
      duration: m.duration,
    }))
);

const sunstreamMessages = computed(() =>
  messages.value
    .filter((m) => m.source.includes('sunstream') || m.target.includes('sunstream'))
    .slice(0, 5)
    .map((m) => ({
      id: m.id,
      method: m.method,
      source: m.source,
      target: m.target,
      timestamp: m.timestamp,
      duration: m.duration,
    }))
);

const agribankMessages = computed(() =>
  messages.value
    .filter((m) => m.source.includes('agribank') || m.target.includes('agribank'))
    .slice(0, 5)
    .map((m) => ({
      id: m.id,
      method: m.method,
      source: m.source,
      target: m.target,
      timestamp: m.timestamp,
      duration: m.duration,
    }))
);

// Infer circuit breaker states from last pipeline trace
const fcsCircuitBreaker = computed(() => {
  const lastMsg = messages.value.find((m) => m.source.includes('fcs'));
  if (!lastMsg) return fcsCB.value;
  const cbStep = lastMsg.pipelineTrace?.steps?.find(
    (s) => s.layer === 'resilience' && s.provider === 'circuit-breaker'
  );
  const state = (cbStep?.metadata as Record<string, unknown>)?.state as string | undefined;
  if (state === 'CLOSED' || state === 'HALF-OPEN' || state === 'OPEN') return state;
  return fcsCB.value;
});

const agribankCircuitBreaker = computed(() => {
  const lastMsg = messages.value.find((m) => m.source.includes('agribank'));
  if (!lastMsg) return agribankCB.value;
  const cbStep = lastMsg.pipelineTrace?.steps?.find(
    (s) => s.layer === 'resilience' && s.provider === 'circuit-breaker'
  );
  const state = (cbStep?.metadata as Record<string, unknown>)?.state as string | undefined;
  if (state === 'CLOSED' || state === 'HALF-OPEN' || state === 'OPEN') return state;
  return agribankCB.value;
});

// Infer trust from last pipeline trace
const fcsTrustComputed = computed(() => {
  const lastMsg = messages.value.find((m) => m.source.includes('fcs'));
  if (!lastMsg) return fcsTrust.value;
  const trustStep = lastMsg.pipelineTrace?.steps?.find((s) => s.layer === 'trust');
  if (!trustStep?.metadata) return fcsTrust.value;
  const meta = trustStep.metadata as Record<string, unknown>;
  const score = typeof meta.trustScore === 'number' ? meta.trustScore : fcsTrust.value.score;
  const level = typeof meta.trustLevel === 'string' ? meta.trustLevel : fcsTrust.value.level;
  return { level: level as typeof fcsTrust.value.level, score };
});

const agribankTrustComputed = computed(() => {
  const lastMsg = messages.value.find((m) => m.source.includes('agribank'));
  if (!lastMsg) return agribankTrust.value;
  const trustStep = lastMsg.pipelineTrace?.steps?.find((s) => s.layer === 'trust');
  if (!trustStep?.metadata) return agribankTrust.value;
  const meta = trustStep.metadata as Record<string, unknown>;
  const score = typeof meta.trustScore === 'number' ? meta.trustScore : agribankTrust.value.score;
  const level = typeof meta.trustLevel === 'string' ? meta.trustLevel : agribankTrust.value.level;
  return { level: level as typeof agribankTrust.value.level, score };
});

// Load org data on mount
const loadError = ref<string | null>(null);
onMounted(async () => {
  try {
    await Promise.all([
      fcsStore.loadData(),
      sunstreamStore.loadData(),
      agribankStore.loadData(),
    ]);
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  }
});
</script>

<template>
  <div class="flex flex-col h-full bg-slate-950 text-slate-100">

    <!-- Top: Scenario selector bar -->
    <ScenarioSelector />

    <!-- Scenario guide panel (slides down below scenario bar when info icon is clicked) -->
    <div v-if="helpStore.activeScenarioGuide !== null" class="px-3 pb-2">
      <ScenarioGuide
        :scenario-id="helpStore.activeScenarioGuide"
        ecosystem="sunstream"
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
      Backend load error: {{ loadError }} — ensure the SunStream backend is running on port 4007
    </div>

    <!-- Main content area -->
    <div class="flex-1 flex flex-col min-h-0 overflow-hidden">

      <!-- Top half: Three org panels -->
      <div class="flex gap-3 p-3 h-[42%] min-h-0">

        <!-- FCS Financial (left) -->
        <div class="flex-1 min-w-0">
          <OrgPanel
            org-id="fcs"
            :trust-level="fcsTrustComputed.level"
            :trust-score="fcsTrustComputed.score"
            :circuit-breaker-state="fcsCircuitBreaker"
            circuit-breaker-target="sunstream"
            :recent-messages="fcsMessages"
            :data-count="loans.length + borrowers.length"
            data-label="loans + borrowers"
          />
        </div>

        <!-- SunStream (center) — highlighted -->
        <div class="flex-1 min-w-0">
          <OrgPanel
            org-id="sunstream"
            :trust-level="trustTowardFcs.level"
            :trust-score="trustTowardFcs.score"
            :circuit-breaker-state="circuitBreakerFcs"
            circuit-breaker-target="fcs"
            :recent-messages="sunstreamMessages"
            :data-count="services.length + associations.length"
            data-label="services + associations"
          />
        </div>

        <!-- AgriBank (right) -->
        <div class="flex-1 min-w-0">
          <OrgPanel
            org-id="agribank"
            :trust-level="agribankTrustComputed.level"
            :trust-score="agribankTrustComputed.score"
            :circuit-breaker-state="agribankCircuitBreaker"
            circuit-breaker-target="sunstream"
            :recent-messages="agribankMessages"
            :data-count="ratings.length"
            data-label="association ratings"
          />
        </div>
      </div>

      <!-- Bottom half: Timeline + Pipeline/Data split -->
      <div class="flex gap-3 px-3 pb-3 flex-1 min-h-0 overflow-hidden">

        <!-- Message timeline (left 60%) -->
        <div class="w-[60%] min-h-0 border border-slate-700/50 rounded-lg overflow-hidden bg-slate-900/50">
          <MessageTimeline />
        </div>

        <!-- Right panel: Pipeline view or Data inspector (40%) -->
        <div class="flex-1 min-h-0 min-w-0 border border-slate-700/50 rounded-lg overflow-hidden bg-slate-900/50 flex flex-col">

          <!-- Tab bar -->
          <div class="flex border-b border-slate-700/50 bg-slate-900/80">
            <button
              :class="[
                'px-4 py-2 text-xs font-medium tracking-wide transition-colors border-b-2',
                rightTab === 'pipeline'
                  ? 'text-slate-100 border-emerald-500'
                  : 'text-slate-500 border-transparent hover:text-slate-300',
              ]"
              @click="rightTab = 'pipeline'"
            >
              Pipeline
            </button>
            <button
              :class="[
                'px-4 py-2 text-xs font-medium tracking-wide transition-colors border-b-2',
                rightTab === 'data'
                  ? 'text-slate-100 border-emerald-500'
                  : 'text-slate-500 border-transparent hover:text-slate-300',
              ]"
              @click="rightTab = 'data'"
            >
              Data Inspector
            </button>
          </div>

          <!-- Tab content -->
          <div class="flex-1 min-h-0 overflow-hidden">
            <PipelineView v-if="rightTab === 'pipeline'" />
            <DataInspector v-else />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
