<template>
  <div class="section-tab">
    <div class="section-draft">
      <header class="section-head">
        <h2>{{ title }}</h2>
        <span v-if="!draft" class="section-pending">
          {{ pendingLabel }}
        </span>
      </header>
      <!-- eslint-disable-next-line vue/no-v-html -- renderedDraft is DOMPurify-sanitized in the computed below -->
      <div v-if="draft" class="section-body" v-html="renderedDraft"></div>
      <div v-else class="section-placeholder">
        Awaiting this section's draft…
      </div>
    </div>
    <CitationsRail
      class="section-rail"
      :citations="citations"
      :document-index="documentIndex"
      :risk-matrix="riskMatrix"
      :deal-breaker-flags="dealBreakerFlags"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import CitationsRail from './CitationsRail.vue';
import type { CitationRef } from '../legalJobsService';

const props = defineProps<{
  title: string;
  draft: string | null;
  citations: CitationRef[];
  documentIndex: Array<Record<string, unknown>>;
  riskMatrix?: { cells?: Array<Record<string, unknown>> };
  dealBreakerFlags: Array<Record<string, unknown>>;
  pendingLabel?: string;
}>();

const renderedDraft = computed<string>(() => {
  if (!props.draft) return '';
  // marked.parse can return Promise<string> when async extensions are
  // configured; we don't use any so it's always sync. Coerce.
  const html = marked.parse(props.draft, { async: false }) as string;
  return DOMPurify.sanitize(html);
});
</script>

<style scoped>
.section-tab {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 0;
  height: 100%;
  overflow: hidden;
}

.section-draft {
  padding: 16px 24px;
  overflow-y: auto;
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-head h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--ion-text-color);
}

.section-pending {
  font-size: 0.78em;
  color: var(--ion-color-warning);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.section-body {
  font-size: 0.92rem;
  line-height: 1.6;
  color: var(--ion-text-color);
}

.section-body :deep(h1) {
  font-size: 1.2rem;
  margin: 16px 0 8px;
}
.section-body :deep(h2) {
  font-size: 1.05rem;
  margin: 14px 0 6px;
}
.section-body :deep(h3) {
  font-size: 0.95rem;
  margin: 12px 0 4px;
}
.section-body :deep(p) {
  margin: 8px 0;
}
.section-body :deep(ul),
.section-body :deep(ol) {
  margin: 8px 0;
  padding-left: 22px;
}
.section-body :deep(blockquote) {
  margin: 8px 0;
  padding: 6px 12px;
  border-left: 3px solid var(--ion-color-step-300);
  color: var(--ion-color-medium);
}
.section-body :deep(code) {
  background: var(--ion-color-step-100);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.9em;
}

.section-placeholder {
  font-size: 0.9em;
  color: var(--ion-color-medium);
  padding: 24px 0;
  font-style: italic;
}

.section-rail {
  min-width: 0;
}

@media (max-width: 768px) {
  .section-tab {
    grid-template-columns: 1fr;
  }
  .section-rail {
    border-left: none;
    border-top: 1px solid var(--ion-color-step-150);
  }
}
</style>
