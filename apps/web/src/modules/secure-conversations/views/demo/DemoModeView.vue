<script setup lang="ts">
import { useDemoStore } from '../../stores/demo.store';
import ScenarioSelector from '../../components/demo/ScenarioSelector.vue';
import DemoOverlay from '../../components/demo/DemoOverlay.vue';

const demoStore = useDemoStore();
</script>

<template>
  <div>
    <ScenarioSelector v-if="!demoStore.activeScenario" />
    <DemoOverlay />
  </div>
</template>
