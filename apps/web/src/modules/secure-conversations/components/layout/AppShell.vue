<script setup lang="ts">
import TopNav from './TopNav.vue';
import SidebarNav from './SidebarNav.vue';
</script>

<template>
  <div class="min-h-screen bg-gray-900">
    <TopNav />
    <SidebarNav />
    <main class="pt-14 pb-8 pl-[220px]">
      <div class="p-6">
        <router-view />
      </div>
    </main>
  </div>
</template>
