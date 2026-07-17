<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  target: string;
  active: boolean;
}>();

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const cutout = ref<Rect | null>(null);

function calculateRect(): void {
  if (!props.target) {
    cutout.value = null;
    return;
  }

  const el = document.querySelector(props.target);
  if (!el) {
    cutout.value = null;
    return;
  }

  const rect = el.getBoundingClientRect();
  cutout.value = {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function handleResize(): void {
  calculateRect();
}

watch(
  () => props.target,
  () => {
    calculateRect();
  },
);

watch(
  () => props.active,
  (isActive) => {
    if (isActive) {
      calculateRect();
    }
  },
);

onMounted(() => {
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});
</script>

<template>
  <div v-if="active" class="fixed inset-0 z-50 pointer-events-none">
    <!-- When no target element found, render plain dark overlay -->
    <div v-if="!cutout" class="absolute inset-0 bg-black/60" />

    <!-- When target found, use the cutout element's box-shadow to create the spotlight hole -->
    <template v-else>
      <!-- Dark overlay fills the entire viewport; the cutout element punches through it
           via a large box-shadow spread so everything outside the hole is dimmed. -->
      <div
        class="spotlight-cutout absolute rounded-sm"
        :style="{
          top: cutout.top + 'px',
          left: cutout.left + 'px',
          width: cutout.width + 'px',
          height: cutout.height + 'px',
        }"
      />
    </template>
  </div>
</template>

<style scoped>
.spotlight-cutout {
  /*
   * The massive box-shadow spread creates the dark overlay around this element.
   * Because the element itself is transparent (no background), the element's own
   * bounding box remains see-through — forming the "spotlight hole".
   */
  box-shadow:
    0 0 0 9999px rgba(0, 0, 0, 0.6),
    0 0 0 2px rgba(99, 179, 237, 0.9);
  animation: spotlight-pulse 2s ease-in-out infinite;
}

@keyframes spotlight-pulse {
  0%, 100% {
    box-shadow:
      0 0 0 9999px rgba(0, 0, 0, 0.6),
      0 0 0 2px rgba(99, 179, 237, 0.9),
      0 0 12px 4px rgba(99, 179, 237, 0.3);
  }
  50% {
    box-shadow:
      0 0 0 9999px rgba(0, 0, 0, 0.6),
      0 0 0 3px rgba(147, 210, 255, 1),
      0 0 20px 8px rgba(99, 179, 237, 0.6);
  }
}
</style>
