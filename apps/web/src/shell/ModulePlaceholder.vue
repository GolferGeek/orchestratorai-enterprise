<template>
  <section class="module-surface">
    <header class="module-header">
      <p class="module-kicker">{{ capability.entitlement }}</p>
      <h1>{{ capability.label }}</h1>
    </header>
    <dl class="module-facts">
      <div>
        <dt>Route</dt>
        <dd>{{ capability.path }}</dd>
      </div>
      <div>
        <dt>API</dt>
        <dd>{{ capability.apiPrefix }}</dd>
      </div>
    </dl>
  </section>
</template>

<script setup lang="ts">
interface ModulePlaceholderCapability {
  label: string;
  path: string;
  entitlement: string;
  apiPrefix: string;
}

defineProps<{
  capability: ModulePlaceholderCapability;
}>();
</script>
