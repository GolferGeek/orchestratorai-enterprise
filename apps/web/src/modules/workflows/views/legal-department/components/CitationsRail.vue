<template>
  <aside class="citations-rail">
    <header class="rail-header">
      <h3>Cited DD Findings</h3>
      <span class="rail-count" v-if="resolved.length > 0"
        >{{ resolved.length }} {{ resolved.length === 1 ? 'cite' : 'cites' }}</span
      >
    </header>

    <p v-if="citations.length === 0" class="rail-empty">
      No citations attached to this section.
    </p>
    <ul v-else class="rail-list">
      <li
        v-for="(cite, i) in resolved"
        :key="`${cite.kind}-${cite.id}-${i}`"
        class="rail-item"
        :class="`kind-${cite.kind}`"
      >
        <div class="rail-item-head">
          <span class="rail-kind">{{ cite.kindLabel }}</span>
          <span v-if="cite.label" class="rail-label">{{ cite.label }}</span>
        </div>
        <p v-if="cite.context" class="rail-context">{{ cite.context }}</p>
        <p class="rail-excerpt">"{{ cite.excerpt }}"</p>
      </li>
    </ul>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CitationRef } from '../legalJobsService';

type ResolvedCitation = {
  kind: 'document' | 'finding' | 'risk' | 'dealbreaker' | 'unknown';
  kindLabel: string;
  id: string;
  label?: string;
  context?: string;
  excerpt: string;
};

const props = defineProps<{
  citations: CitationRef[];
  /** Document index from the parent DD room (entries keyed by documentId). */
  documentIndex: Array<Record<string, unknown>>;
  /** Risk matrix from the parent DD room. */
  riskMatrix?: { cells?: Array<Record<string, unknown>> };
  dealBreakerFlags: Array<Record<string, unknown>>;
}>();

function getString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

const documentMap = computed<Record<string, Record<string, unknown>>>(() => {
  const map: Record<string, Record<string, unknown>> = {};
  for (const doc of props.documentIndex) {
    const id =
      getString(doc.documentId) ?? getString(doc.id) ?? getString(doc.path);
    if (id) map[id] = doc;
  }
  return map;
});

const riskRowMap = computed<Record<string, Record<string, unknown>>>(() => {
  const map: Record<string, Record<string, unknown>> = {};
  for (const row of props.riskMatrix?.cells ?? []) {
    const id = getString(row.id) ?? getString(row.riskRowId);
    if (id) map[id] = row;
  }
  return map;
});

const dealBreakerMap = computed<Record<string, Record<string, unknown>>>(() => {
  const map: Record<string, Record<string, unknown>> = {};
  for (const flag of props.dealBreakerFlags) {
    const id = getString(flag.id) ?? getString(flag.dealBreakerFlagId);
    if (id) map[id] = flag;
  }
  return map;
});

const resolved = computed<ResolvedCitation[]>(() =>
  props.citations.map((c) => resolveOne(c)),
);

function resolveOne(c: CitationRef): ResolvedCitation {
  if (c.dealBreakerFlagId) {
    const flag = dealBreakerMap.value[c.dealBreakerFlagId];
    return {
      kind: 'dealbreaker',
      kindLabel: 'Deal Breaker',
      id: c.dealBreakerFlagId,
      label:
        getString(flag?.title) ??
        getString(flag?.description) ??
        c.dealBreakerFlagId,
      context: getString(flag?.severity)
        ? `Severity: ${flag?.severity as string}`
        : undefined,
      excerpt: c.excerpt,
    };
  }
  if (c.riskRowId) {
    const row = riskRowMap.value[c.riskRowId];
    return {
      kind: 'risk',
      kindLabel: 'Risk Matrix',
      id: c.riskRowId,
      label:
        getString(row?.category) ??
        getString(row?.title) ??
        c.riskRowId,
      context: getString(row?.severity)
        ? `Severity: ${row?.severity as string}`
        : undefined,
      excerpt: c.excerpt,
    };
  }
  if (c.findingId) {
    return {
      kind: 'finding',
      kindLabel: 'Finding',
      id: c.findingId,
      label: c.findingId,
      excerpt: c.excerpt,
    };
  }
  if (c.documentId) {
    const doc = documentMap.value[c.documentId];
    return {
      kind: 'document',
      kindLabel: 'Document',
      id: c.documentId,
      label:
        getString(doc?.documentName) ??
        getString(doc?.name) ??
        getString(doc?.path) ??
        c.documentId,
      context: getString(doc?.documentType)
        ? `Type: ${doc?.documentType as string}`
        : undefined,
      excerpt: c.excerpt,
    };
  }
  return {
    kind: 'unknown',
    kindLabel: 'Citation',
    id: '',
    excerpt: c.excerpt,
  };
}
</script>

<style scoped>
.citations-rail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--ion-color-step-50);
  border-left: 1px solid var(--ion-color-step-150);
  height: 100%;
  overflow-y: auto;
}

.rail-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.rail-header h3 {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ion-color-medium);
}

.rail-count {
  font-size: 0.75em;
  color: var(--ion-color-medium);
}

.rail-empty {
  color: var(--ion-color-medium);
  font-size: 0.85em;
  margin: 8px 0 0;
}

.rail-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rail-item {
  background: var(--ion-background-color);
  border: 1px solid var(--ion-color-step-150);
  border-left-width: 3px;
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 0.85em;
}

.rail-item.kind-dealbreaker {
  border-left-color: var(--ion-color-danger);
}
.rail-item.kind-risk {
  border-left-color: var(--ion-color-warning);
}
.rail-item.kind-finding {
  border-left-color: var(--ion-color-tertiary);
}
.rail-item.kind-document {
  border-left-color: var(--ion-color-primary);
}
.rail-item.kind-unknown {
  border-left-color: var(--ion-color-medium);
}

.rail-item-head {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: baseline;
  margin-bottom: 4px;
}

.rail-kind {
  font-size: 0.7em;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ion-color-medium);
}

.rail-label {
  font-weight: 600;
  color: var(--ion-text-color);
}

.rail-context {
  margin: 2px 0 4px;
  font-size: 0.78em;
  color: var(--ion-color-medium);
}

.rail-excerpt {
  margin: 0;
  font-style: italic;
  color: var(--ion-text-color);
  line-height: 1.45;
}
</style>
