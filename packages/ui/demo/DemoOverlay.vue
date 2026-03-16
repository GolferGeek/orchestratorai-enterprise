<script setup lang="ts">
import { useDemoStore } from '../../stores/demo.store';
import StepNarration from './StepNarration.vue';

const demoStore = useDemoStore();

const SPEED_OPTIONS = [0.5, 1, 2] as const;

function togglePlayPause() {
  if (demoStore.isPlaying) {
    demoStore.pause();
  } else {
    demoStore.resume();
  }
}

function handleAutoPlay() {
  demoStore.autoPlay();
}

function cycleSpeed() {
  const currentIndex = SPEED_OPTIONS.indexOf(demoStore.playbackSpeed as 0.5 | 1 | 2);
  const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
  demoStore.setPlaybackSpeed(SPEED_OPTIONS[nextIndex]);
}

function progressPercent(): number {
  if (demoStore.totalSteps === 0) return 0;
  return ((demoStore.currentStepIndex + 1) / demoStore.totalSteps) * 100;
}
</script>

<template>
  <div
    v-if="demoStore.activeScenario && demoStore.currentStep"
    class="fixed inset-0 z-50 flex flex-col pointer-events-none"
  >
    <!-- Semi-transparent backdrop -->
    <div class="flex-1 bg-black/40 pointer-events-auto" @click.stop />

    <!-- Bottom control bar -->
    <div class="pointer-events-auto bg-gray-900 border-t border-gray-700 shadow-2xl">
      <!-- Progress bar -->
      <div class="h-1 bg-gray-800">
        <div
          class="h-full bg-blue-500 transition-all duration-300"
          :style="{ width: progressPercent() + '%' }"
        />
      </div>

      <div class="px-6 py-4">
        <!-- Header row: scenario name + step counter -->
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-3">
            <h2 class="text-white font-semibold">{{ demoStore.activeScenario.name }}</h2>
            <span class="text-gray-400 text-sm">
              Step {{ demoStore.currentStepIndex + 1 }} of {{ demoStore.totalSteps }}
            </span>
          </div>
          <span class="text-gray-400 text-sm font-medium">
            {{ demoStore.currentStep.title }}
          </span>
        </div>

        <!-- Narration -->
        <div class="mb-4">
          <StepNarration :step="demoStore.currentStep" />
        </div>

        <!-- Controls -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <!-- Prev -->
            <button
              :disabled="demoStore.isFirstStep"
              class="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Previous step"
              @click="demoStore.prevStep()"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <!-- Play/Pause -->
            <button
              class="p-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
              :title="demoStore.isPlaying ? 'Pause' : 'Play'"
              @click="togglePlayPause()"
            >
              <!-- Pause icon -->
              <svg v-if="demoStore.isPlaying" class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
              <!-- Play icon -->
              <svg v-else class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>

            <!-- Next -->
            <button
              :disabled="demoStore.isLastStep"
              class="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Next step"
              @click="demoStore.nextStep()"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <!-- Auto-play from start -->
            <button
              class="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors ml-2"
              title="Auto-play from start"
              @click="handleAutoPlay()"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          <div class="flex items-center gap-3">
            <!-- Speed selector -->
            <button
              class="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 text-sm font-mono hover:bg-gray-700 transition-colors"
              title="Cycle playback speed"
              @click="cycleSpeed()"
            >
              {{ demoStore.playbackSpeed }}x
            </button>

            <!-- Stop -->
            <button
              class="px-4 py-1.5 rounded-lg bg-gray-800 text-gray-400 text-sm hover:text-red-400 hover:bg-gray-700 transition-colors"
              title="Stop and exit demo"
              @click="demoStore.stop()"
            >
              Stop
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
