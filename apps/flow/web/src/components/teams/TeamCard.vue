<script setup lang="ts">
import type { ApiTeam } from '@/types/flow';
import { RouterLink } from 'vue-router';

defineProps<{
  team: ApiTeam;
}>();
</script>

<template>
  <RouterLink :to="`/teams/${team.id}`" class="card" style="display:block;text-decoration:none;transition:all 0.15s;" @mouseover="($el as HTMLElement).style.borderColor='var(--color-primary)'" @mouseleave="($el as HTMLElement).style.borderColor='var(--color-border)'">
    <div class="flex items-center gap-3 mb-3">
      <div
        style="width:40px;height:40px;border-radius:10px;background:rgba(124,106,255,0.15);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;"
      >
        ◈
      </div>
      <div style="min-width:0;">
        <div class="font-semibold truncate">{{ team.name }}</div>
        <div class="text-xs text-muted">{{ team.orgSlug }}</div>
      </div>
    </div>

    <div v-if="team.description" class="text-sm text-muted mb-3 truncate">
      {{ team.description }}
    </div>

    <div class="flex items-center justify-between text-xs text-muted">
      <span>{{ team.memberCount }} member{{ team.memberCount !== 1 ? 's' : '' }}</span>
      <span>View team →</span>
    </div>
  </RouterLink>
</template>
