<template>
  <div class="landing-shell">
    <router-view />
  </div>
</template>

<script setup lang="ts">
import './styles/global.css';
</script>

<style scoped>
.landing-shell {
  min-height: 100vh;
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.6;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
</style>
