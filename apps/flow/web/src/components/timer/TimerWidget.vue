<template>
  <div class="flex flex-col items-center gap-8">

    <!-- Mode toggle + Settings -->
    <div class="flex items-center gap-4">
      <div class="flex gap-2">
        <button
          :class="[
            'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
            !isBreak
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
          ]"
          :disabled="isRunning"
          @click="toggleBreak"
        >
          Focus
        </button>
        <button
          :class="[
            'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
            isBreak
              ? 'bg-green-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
          ]"
          :disabled="isRunning"
          @click="toggleBreak"
        >
          Break
        </button>
      </div>

      <!-- Settings panel -->
      <div class="relative">
        <button
          class="p-2 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
          @click="showSettings = !showSettings"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        <div
          v-if="showSettings"
          class="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-10 space-y-4"
        >
          <h4 class="font-medium text-sm text-gray-900">Timer Settings</h4>

          <div class="space-y-1">
            <label class="block text-xs font-medium text-gray-700">
              Focus Duration (minutes)
            </label>
            <input
              v-model.number="tempFocus"
              type="number"
              min="1"
              max="120"
              :disabled="isRunning"
              class="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          <div class="space-y-1">
            <label class="block text-xs font-medium text-gray-700">
              Break Duration (minutes)
            </label>
            <input
              v-model.number="tempBreak"
              type="number"
              min="1"
              max="60"
              :disabled="isRunning"
              class="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          <div class="flex items-center justify-between">
            <label class="text-sm text-gray-700">Auto-continue</label>
            <button
              :class="[
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                autoContinue ? 'bg-blue-600' : 'bg-gray-200',
              ]"
              @click="autoContinue = !autoContinue"
            >
              <span
                :class="[
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                  autoContinue ? 'translate-x-6' : 'translate-x-1',
                ]"
              />
            </button>
          </div>
          <p class="text-xs text-gray-500">
            Automatically switch between focus and break
          </p>

          <button
            :disabled="isRunning"
            class="w-full bg-blue-600 text-white text-sm py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            @click="saveSettings"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>

    <!-- Timer display -->
    <div
      :class="[
        'relative w-72 h-72 rounded-full bg-white border border-gray-200 flex items-center justify-center transition-all duration-500 shadow-lg',
        isRunning && !isBreak ? 'ring-4 ring-blue-400 ring-opacity-60' : '',
        isRunning && isBreak ? 'ring-4 ring-green-400 ring-opacity-60' : '',
      ]"
    >
      <!-- Progress ring -->
      <svg class="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" fill="none" stroke="#e5e7eb" stroke-width="2" />
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          :stroke="isBreak ? '#10b981' : '#3b82f6'"
          stroke-width="3"
          stroke-linecap="round"
          :stroke-dasharray="`${2 * Math.PI * 45}`"
          :stroke-dashoffset="`${2 * Math.PI * 45 * (1 - progressRatio)}`"
          class="transition-all duration-200"
        />
      </svg>

      <!-- Time -->
      <div class="relative z-10 text-center">
        <span class="font-mono text-6xl font-semibold tracking-tight text-gray-900">
          {{ formattedTime }}
        </span>
        <p :class="['text-sm mt-2', isBreak ? 'text-green-600' : 'text-blue-600']">
          {{ isBreak ? 'Break Time' : 'Focus Time' }}
        </p>
      </div>
    </div>

    <!-- Controls -->
    <div class="flex gap-3">
      <button
        v-if="!isRunning"
        class="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-lg text-lg font-medium hover:bg-blue-700 transition-colors"
        @click="handleStart"
      >
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
        </svg>
        Start
      </button>
      <button
        v-else
        class="flex items-center gap-2 px-8 py-3 bg-gray-200 text-gray-800 rounded-lg text-lg font-medium hover:bg-gray-300 transition-colors"
        @click="handlePause"
      >
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
        </svg>
        Pause
      </button>
      <button
        class="flex items-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg text-lg font-medium hover:bg-gray-50 transition-colors"
        @click="handleReset"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Reset
      </button>
    </div>

    <!-- Status indicators -->
    <div class="flex flex-col items-center gap-1 text-xs text-gray-500">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        Synced with team
      </div>
      <span v-if="autoContinue" class="text-blue-500">Auto-continue enabled</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSharedTimer } from '@/composables/useSharedTimer';

const props = defineProps<{
  teamId?: string | null;
  onFocusComplete?: () => void;
}>();

const {
  timeLeft,
  isRunning,
  isBreak,
  focusMinutes,
  breakMinutes,
  autoContinue,
  handleStart,
  handlePause,
  handleReset,
  toggleBreak,
  setCustomDurations,
} = useSharedTimer(props.onFocusComplete, props.teamId);

const showSettings = ref(false);
const tempFocus = ref(focusMinutes.value);
const tempBreak = ref(breakMinutes.value);

const formattedTime = computed(() => {
  const mins = Math.floor(timeLeft.value / 60);
  const secs = timeLeft.value % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
});

const progressRatio = computed(() => {
  const total = (isBreak.value ? breakMinutes.value : focusMinutes.value) * 60;
  if (total === 0) return 0;
  return timeLeft.value / total;
});

function saveSettings() {
  setCustomDurations(tempFocus.value, tempBreak.value);
  showSettings.value = false;
}
</script>
