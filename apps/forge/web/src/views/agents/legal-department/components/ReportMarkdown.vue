<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="report markdown-body" v-html="html"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { marked } from 'marked';

const props = defineProps<{
  markdown?: string | null;
}>();

const html = computed(() => {
  const md = props.markdown;
  if (!md) return '';
  // marked v15 has gfm on by default. Output is rendered in our own
  // admin UI for known LLM responses; not exposed to public users.
  return marked.parse(md, { async: false }) as string;
});
</script>

<style scoped>
.report {
  background: var(--ion-color-step-50);
  padding: 16px 20px;
  border-radius: 6px;
  font-size: 0.9em;
  margin: 0;
  line-height: 1.55;
}

.markdown-body :deep(h1) {
  font-size: 1.4em;
  font-weight: 700;
  margin: 0 0 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--ion-color-step-200);
}

.markdown-body :deep(h2) {
  font-size: 1.15em;
  font-weight: 700;
  margin: 18px 0 8px;
  color: var(--ion-color-primary);
}

.markdown-body :deep(h3) {
  font-size: 1em;
  font-weight: 600;
  margin: 14px 0 6px;
}

.markdown-body :deep(p) {
  margin: 0 0 10px;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0 0 10px;
  padding-left: 22px;
}

.markdown-body :deep(li) {
  margin: 3px 0;
}

.markdown-body :deep(li p) {
  margin: 0;
}

.markdown-body :deep(strong) {
  color: var(--ion-color-dark);
  font-weight: 600;
}

.markdown-body :deep(code) {
  background: var(--ion-color-step-150);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 0.88em;
}

.markdown-body :deep(pre) {
  background: var(--ion-color-step-100);
  padding: 10px 12px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 0.85em;
  margin: 0 0 12px;
}

.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
}

.markdown-body :deep(blockquote) {
  border-left: 3px solid var(--ion-color-primary);
  padding: 2px 0 2px 14px;
  margin: 8px 0;
  color: var(--ion-color-medium);
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  margin: 0 0 12px;
  font-size: 0.88em;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--ion-color-step-200);
  padding: 6px 10px;
  text-align: left;
}

.markdown-body :deep(th) {
  background: var(--ion-color-step-100);
  font-weight: 600;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--ion-color-step-200);
  margin: 14px 0;
}
</style>
