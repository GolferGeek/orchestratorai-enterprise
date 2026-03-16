<script setup lang="ts">
import { OaiAppShell } from '@orchestratorai/ui';
import type { NavItem } from '@orchestratorai/ui';
import {
  gridOutline,
  timerOutline,
  listOutline,
  radioOutline,
} from 'ionicons/icons';

const navItems: NavItem[] = [
  { label: 'Dashboard', icon: gridOutline, path: '/' },
  { label: 'Triggers', icon: timerOutline, path: '/triggers' },
  { label: 'Executions', icon: listOutline, path: '/executions' },
  { label: 'Listeners', icon: radioOutline, path: '/listeners' },
];
</script>

<template>
  <OaiAppShell
    product-name="Pulse"
    product-slug="pulse"
    :nav-items="navItems"
    :show-crawler-bubble="false"
    :use-router-outlet="true"
  />
</template>
