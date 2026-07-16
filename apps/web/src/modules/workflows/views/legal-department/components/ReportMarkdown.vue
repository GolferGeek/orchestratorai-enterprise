<template>
  <!-- eslint-disable-next-line vue/no-v-html -- html is sanitized through DOMPurify in the computed below -->
  <div class="report markdown-body" v-html="html"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const props = defineProps<{
  markdown?: string | null;
}>();

const html = computed(() => {
  const md = props.markdown;
  if (!md) return '';
  const rawHtml = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(rawHtml);
});
</script>

<style scoped>
.report {
  background:
    linear-gradient(180deg, rgba(var(--ion-color-primary-rgb), 0.055), transparent 180px),
    var(--ion-background-color);
  padding: 24px 28px;
  border: 1px solid var(--ion-color-step-150);
  border-radius: 14px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.07);
  font-size: 0.95em;
  margin: 0;
  line-height: 1.65;
  color: var(--ion-color-dark);
}

.markdown-body :deep(h1) {
  font-size: clamp(1.55rem, 3vw, 2.15rem);
  line-height: 1.12;
  font-weight: 800;
  letter-spacing: -0.035em;
  margin: 0 0 18px;
  padding-bottom: 14px;
  border-bottom: 2px solid rgba(var(--ion-color-primary-rgb), 0.22);
  color: var(--ion-color-dark);
}

.markdown-body :deep(h2) {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.22em;
  font-weight: 750;
  margin: 28px 0 12px;
  color: var(--ion-color-primary);
  letter-spacing: -0.01em;
}

.markdown-body :deep(h2::before) {
  content: '';
  width: 7px;
  height: 1.35em;
  border-radius: 999px;
  background: var(--ion-color-primary);
  flex: 0 0 auto;
}

.markdown-body :deep(h3) {
  font-size: 1.02em;
  font-weight: 700;
  margin: 18px 0 8px;
  color: var(--ion-color-dark);
}

.markdown-body :deep(p) {
  margin: 0 0 12px;
  max-width: 82ch;
}

.markdown-body :deep(a) {
  color: var(--ion-color-primary);
  font-weight: 600;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0 0 14px;
  padding-left: 24px;
}

.markdown-body :deep(li) {
  margin: 5px 0;
  padding-left: 2px;
}

.markdown-body :deep(li p) {
  margin: 0;
}

.markdown-body :deep(strong) {
  color: var(--ion-color-dark);
  font-weight: 700;
}

.markdown-body :deep(code) {
  background: rgba(var(--ion-color-primary-rgb), 0.09);
  color: var(--ion-color-primary-shade);
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 0.88em;
}

.markdown-body :deep(pre) {
  background: #0f172a;
  color: #e2e8f0;
  padding: 14px 16px;
  border-radius: 10px;
  overflow-x: auto;
  font-size: 0.85em;
  margin: 0 0 16px;
}

.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
}

.markdown-body :deep(blockquote) {
  border-left: 4px solid var(--ion-color-primary);
  background: rgba(var(--ion-color-primary-rgb), 0.06);
  padding: 10px 14px;
  margin: 12px 0 16px;
  color: var(--ion-color-dark);
  border-radius: 0 10px 10px 0;
}

.markdown-body :deep(table) {
  display: block;
  width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
  margin: 8px 0 18px;
  font-size: 0.9em;
  background: var(--ion-background-color);
  border: 1px solid var(--ion-color-step-150);
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.045);
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--ion-color-step-150);
  padding: 10px 12px;
  text-align: left;
  vertical-align: top;
}

.markdown-body :deep(th) {
  background: rgba(var(--ion-color-primary-rgb), 0.09);
  color: var(--ion-color-dark);
  font-weight: 750;
  white-space: nowrap;
}

.markdown-body :deep(tbody tr:nth-child(even)) {
  background: var(--ion-color-step-50);
}

.markdown-body :deep(td:first-child),
.markdown-body :deep(th:first-child) {
  border-left: none;
}

.markdown-body :deep(td:last-child),
.markdown-body :deep(th:last-child) {
  border-right: none;
}

.markdown-body :deep(tr:first-child th) {
  border-top: none;
}

.markdown-body :deep(tbody tr:last-child td) {
  border-bottom: none;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--ion-color-step-200);
  margin: 22px 0;
}

.markdown-body :deep(input[type='checkbox']) {
  accent-color: var(--ion-color-primary);
  transform: translateY(1px);
  margin-right: 6px;
}

@media (max-width: 720px) {
  .report {
    padding: 18px 16px;
    border-radius: 10px;
  }

  .markdown-body :deep(h1) {
    font-size: 1.5rem;
  }

  .markdown-body :deep(table) {
    font-size: 0.82em;
  }
}
</style>
