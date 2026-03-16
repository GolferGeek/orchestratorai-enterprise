<script setup lang="ts">
import { OaiAppShell } from '@orchestratorai/ui';
import type { NavItem } from '@orchestratorai/ui';
import {
  homeOutline,
  listOutline,
  downloadOutline,
  cloudUploadOutline,
  shieldCheckmarkOutline,
  analyticsOutline,
  playCircleOutline,
  terminalOutline,
  settingsOutline,
} from 'ionicons/icons';

const navItems: NavItem[] = [
  { label: 'Home', icon: homeOutline, path: '/' },
  { label: 'Registry', icon: listOutline, path: '/registry' },
  { label: 'Inbound', icon: downloadOutline, path: '/inbound' },
  { label: 'Outbound', icon: cloudUploadOutline, path: '/outbound' },
  { label: 'Security', icon: shieldCheckmarkOutline, path: '/security' },
  { label: 'Observability', icon: analyticsOutline, path: '/observability' },
  { label: 'Scenarios', icon: playCircleOutline, path: '/scenarios' },
  { label: 'Demo', icon: terminalOutline, path: '/demo' },
  { label: 'Settings', icon: settingsOutline, path: '/settings' },
];
</script>

<template>
  <OaiAppShell
    product-name="Bridge"
    product-slug="bridge"
    :nav-items="navItems"
    :show-crawler-bubble="false"
    :use-router-outlet="true"
  />
</template>
