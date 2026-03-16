<script setup lang="ts">
import { useRouter } from 'vue-router';
const router = useRouter();
</script>

<template>
  <div class="empty-state min-h-screen">
    <span style="font-size:48px;">404</span>
    <h1 class="font-semibold text-xl">Page not found</h1>
    <p class="text-muted">The page you're looking for doesn't exist.</p>
    <button class="btn btn-primary" @click="router.push('/')">Go Home</button>
  </div>
</template>
