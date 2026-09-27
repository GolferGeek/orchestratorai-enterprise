<template>
  <!-- Model-written prose: markdown rendered, sanitized. -->
  <div class="prose" v-html="html" />
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

const props = defineProps<{ text: string }>();
const html = computed(() => DOMPurify.sanitize(marked.parse(props.text, { async: false })));
</script>

<style scoped>
.prose { line-height: 1.55; }
.prose :deep(h1), .prose :deep(h2), .prose :deep(h3), .prose :deep(h4) { font-size: 15px; margin: 12px 0 4px; }
.prose :deep(p) { margin: 0 0 8px; }
.prose :deep(ul), .prose :deep(ol) { padding-left: 20px; margin: 0 0 8px; list-style: revert; }
</style>
