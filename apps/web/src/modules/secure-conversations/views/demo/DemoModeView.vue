<script setup lang="ts">
import ModulePage from '@/shared/layout/ModulePage.vue';
import { useDemoStore } from '../../stores/demo.store';
import ScenarioSelector from '../../components/demo/ScenarioSelector.vue';
import DemoOverlay from '../../components/demo/DemoOverlay.vue';

const demoStore = useDemoStore();
</script>

<template>
  <ModulePage>
  <div>
    <ScenarioSelector v-if="!demoStore.activeScenario" />
    <DemoOverlay />
  </div>
  </ModulePage>
</template>
