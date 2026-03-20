<script setup lang="ts">
type Speed = 0.5 | 1 | 2;

const props = defineProps<{
  isFirst: boolean;
  isLast: boolean;
  isPlaying: boolean;
  speed: Speed;
}>();

const emit = defineEmits<{
  prev: [];
  next: [];
  play: [];
  pause: [];
  setSpeed: [speed: Speed];
}>();

const SPEED_OPTIONS: Speed[] = [0.5, 1, 2];

function handlePlayPause() {
  if (props.isPlaying) {
    emit('pause');
  } else {
    emit('play');
  }
}

function selectSpeed(s: Speed) {
  emit('setSpeed', s);
}
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- Previous -->
    <button
      :disabled="isFirst"
      class="p-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      title="Previous step"
      @click="emit('prev')"
    >
      <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
      </svg>
    </button>

    <!-- Play / Pause -->
    <button
      class="p-2 rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors"
      :title="isPlaying ? 'Pause' : 'Play'"
      @click="handlePlayPause()"
    >
      <!-- Pause icon -->
      <svg v-if="isPlaying" class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
      </svg>
      <!-- Play icon -->
      <svg v-else class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z" />
      </svg>
    </button>

    <!-- Next -->
    <button
      :disabled="isLast"
      class="p-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      title="Next step"
      @click="emit('next')"
    >
      <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z" />
      </svg>
    </button>

    <!-- Speed selector -->
    <div class="flex items-center gap-1 ml-2">
      <button
        v-for="s in SPEED_OPTIONS"
        :key="s"
        class="px-2 py-1 rounded text-xs font-mono transition-colors"
        :class="speed === s
          ? 'bg-blue-600 text-white'
          : 'bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white'"
        :title="`Set speed to ${s}x`"
        @click="selectSpeed(s)"
      >
        {{ s }}x
      </button>
    </div>
  </div>
</template>
