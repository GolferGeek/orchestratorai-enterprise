<script setup lang="ts">
/**
 * ClaudePaneToolProgress
 *
 * Displays the current tool execution status with animated verbs
 * like "Reading...", "Writing...", "Searching..." — similar to Claude Code CLI.
 * Fully self-contained, no external dependencies.
 */

import { computed, ref, watchEffect, onUnmounted } from 'vue';
import type { ActiveTool } from './claudePaneService';

const props = defineProps<{
  activeTools: Map<string, ActiveTool>;
  currentVerb: string;
}>();

const runningTools = computed(() =>
  Array.from(props.activeTools.values()).filter((t) => t.status === 'running'),
);

const dots = ref(0);
let dotsInterval: ReturnType<typeof setInterval> | null = null;

watchEffect(() => {
  if (props.currentVerb) {
    if (!dotsInterval) {
      dotsInterval = setInterval(() => {
        dots.value = (dots.value + 1) % 4;
      }, 400);
    }
  } else {
    if (dotsInterval) {
      clearInterval(dotsInterval);
      dotsInterval = null;
    }
    dots.value = 0;
  }
});

onUnmounted(() => {
  if (dotsInterval) {
    clearInterval(dotsInterval);
  }
});

function formatElapsed(seconds: number): string {
  if (seconds < 1) return '';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m ${secs}s`;
}

const verbText = computed(() => props.currentVerb.replace(/\.+$/, ''));
const animatedDots = computed(() => '.'.repeat(dots.value));
const shouldShow = computed(() => props.currentVerb || runningTools.value.length > 0);
</script>

<template>
  <div v-if="shouldShow" class="tool-progress">
    <div v-if="currentVerb" class="verb-indicator">
      <svg class="spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="23 4 23 10 17 10"/>
        <polyline points="1 20 1 14 7 14"/>
        <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0120.49 9z"/>
      </svg>
      <span class="verb-text">
        {{ verbText }}<span class="dots">{{ animatedDots }}</span>
      </span>
    </div>

    <div v-if="runningTools.length > 1" class="tool-indicators">
      <div
        v-for="tool in runningTools"
        :key="tool.id"
        class="tool-indicator"
        :class="'status-' + tool.status"
      >
        <svg v-if="tool.status === 'running'" class="spin-icon small" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10"/>
          <polyline points="1 20 1 14 7 14"/>
          <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0120.49 9z"/>
        </svg>
        <svg v-else-if="tool.status === 'completed'" class="status-icon success-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <svg v-else-if="tool.status === 'error'" class="status-icon error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span class="tool-name">{{ tool.name }}</span>
        <span v-if="tool.elapsedSeconds > 0" class="elapsed">{{ formatElapsed(tool.elapsedSeconds) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.verb-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--cp-text, #1a1a1a);
}

.spin-icon {
  width: 16px;
  height: 16px;
  animation: spin 1s linear infinite;
  flex-shrink: 0;
}

.spin-icon.small {
  width: 12px;
  height: 12px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.verb-text {
  display: flex;
}

.dots {
  display: inline-block;
  width: 24px;
  text-align: left;
}

.tool-indicators {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tool-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 12px;
}

.tool-indicator.status-running {
  background: rgba(var(--cp-primary-rgb, 25, 118, 210), 0.12);
  color: var(--cp-primary, #1976d2);
}

.tool-indicator.status-completed {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}

.tool-indicator.status-error {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.status-icon {
  width: 12px;
  height: 12px;
}

.success-icon {
  color: #10b981;
}

.error-icon {
  color: #ef4444;
}

.tool-name {
  font-weight: 500;
}

.elapsed {
  color: var(--cp-text-secondary, #666666);
}
</style>
