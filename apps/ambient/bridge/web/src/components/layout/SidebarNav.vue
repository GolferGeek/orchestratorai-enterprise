<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

interface NavItem {
  label: string;
  path: string;
  icon: string;
  external?: boolean;
}

const currentSection = computed(() => {
  const path = route.path;
  if (path.startsWith('/registry')) return 'registry';
  if (path.startsWith('/inbound')) return 'inbound';
  if (path.startsWith('/outbound')) return 'outbound';
  if (path.startsWith('/security')) return 'security';
  if (path.startsWith('/observability')) return 'observability';
  if (path.startsWith('/scenarios') || path.startsWith('/demo')) return 'training';
  if (path.startsWith('/matrix') || path.startsWith('/protocol-compare')) return 'tools';
  return 'home';
});

const navItems = computed<NavItem[]>(() => {
  switch (currentSection.value) {
    case 'registry':
      return [
        { label: 'All Agents', path: '/registry', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
      ];
    case 'inbound':
      return [
        { label: 'Live Stream', path: '/inbound', icon: 'M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
      ];
    case 'outbound':
      return [
        { label: 'Send Request', path: '/outbound', icon: 'M14 5l7 7m0 0l-7 7m7-7H3' },
      ];
    case 'security':
      return [
        { label: 'Violations', path: '/security', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
      ];
    case 'observability':
      return [
        { label: 'Message Log', path: '/observability', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
        { label: 'Topology', path: '/observability/topology', icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9' },
        { label: 'Timeline', path: '/observability/timeline', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
        { label: 'Metrics', path: '/observability/metrics', icon: 'M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
        { label: 'Audit Trail', path: '/observability/audit', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
      ];
    case 'training':
      return [
        { label: 'Scenarios', path: '/scenarios', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
        { label: 'Demo Mode', path: '/demo', icon: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
      ];
    case 'tools':
      return [
        { label: 'Protocol Matrix', path: '/matrix', icon: 'M4 6h16M4 12h16M4 18h16M9 4v16M15 4v16' },
        { label: 'Protocol Compare', path: '/protocol-compare', icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3' },
      ];
    default:
      return [
        { label: 'Overview', path: '/', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
        { label: 'Agent Registry', path: '/registry', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
        { label: 'Inbound A2A', path: '/inbound', icon: 'M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
        { label: 'Outbound A2A', path: '/outbound', icon: 'M14 5l7 7m0 0l-7 7m7-7H3' },
        { label: 'Security', path: '/security', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
        { label: 'Observability', path: '/observability', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
        { label: 'Scenarios', path: '/scenarios', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
        { label: 'Protocol Matrix', path: '/matrix', icon: 'M4 6h16M4 12h16M4 18h16M9 4v16M15 4v16' },
        { label: 'Settings', path: '/settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
      ];
  }
});

function isActive(path: string): boolean {
  return route.path === path;
}
</script>

<template>
  <aside class="fixed left-0 top-14 bottom-8 w-[220px] bg-gray-800 border-r border-gray-700 overflow-y-auto z-40">
    <div class="p-3">
      <p class="text-xs text-gray-400 uppercase tracking-wider mb-3 px-2">
        {{ currentSection === 'home' ? 'Bridge' : currentSection.replace('-', ' ') }}
      </p>
      <nav class="space-y-1">
        <template v-for="item in navItems" :key="item.path">
          <a
            v-if="item.external"
            :href="item.path"
            target="_blank"
            rel="noopener"
            class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-gray-400 hover:text-gray-200 hover:bg-gray-700"
          >
            <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="item.icon" />
            </svg>
            <span>{{ item.label }}</span>
          </a>
          <router-link
            v-else
            :to="item.path"
            :class="[
              'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
              isActive(item.path)
                ? 'bg-blue-700 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700',
            ]"
          >
            <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="item.icon" />
            </svg>
            <span>{{ item.label }}</span>
          </router-link>
        </template>
      </nav>
    </div>
  </aside>
</template>
