<template>
  <div class="public-layout">
    <router-view />
    <CustomerServiceWidget />
  </div>
</template>

<script setup lang="ts">
import CustomerServiceWidget from './CustomerServiceWidget.vue';
</script>

<style scoped>
.public-layout {
  min-height: 100vh;
  background: var(--bg-base);
  color: var(--text-primary);
}
</style>
