<template>
  <div class="journey-template-selector">
    <div v-if="loading" class="journey-template-selector__loading">
      Loading templates...
    </div>

    <div v-else-if="templates.length === 0" class="journey-template-selector__empty">
      No journey templates available.
    </div>

    <div v-else class="journey-template-selector__grid">
      <button
        v-for="template in templates"
        :key="template.id"
        class="journey-template-card"
        :class="{ 'journey-template-card--selected': selectedId === template.id }"
        type="button"
        @click="selectTemplate(template)"
      >
        <span v-if="template.icon" class="journey-template-card__icon" aria-hidden="true">
          {{ template.icon }}
        </span>

        <div class="journey-template-card__body">
          <h3 class="journey-template-card__name">{{ template.name }}</h3>
          <p v-if="template.description" class="journey-template-card__description">
            {{ template.description }}
          </p>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useJourneyTemplates } from '@/composables/useJourneyTemplates';
import type { JourneyTemplateResponse } from '@/types/flow';

const emit = defineEmits<{
  (e: 'select', template: JourneyTemplateResponse): void;
}>();

const { templates, loading } = useJourneyTemplates();

const selectedId = ref<string | null>(null);

function selectTemplate(template: JourneyTemplateResponse): void {
  selectedId.value = template.id;
  emit('select', template);
}
</script>

<style scoped>
.journey-template-selector__loading,
.journey-template-selector__empty {
  padding: 1.5rem;
  color: var(--color-text-muted, #6b7280);
  text-align: center;
}

.journey-template-selector__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
}

.journey-template-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 1rem;
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 0.5rem;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, box-shadow 0.15s;
  width: 100%;
}

.journey-template-card:hover {
  border-color: var(--color-primary, #6366f1);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}

.journey-template-card--selected {
  border-color: var(--color-primary, #6366f1);
  background: var(--color-primary-light, #eef2ff);
}

.journey-template-card__icon {
  font-size: 1.75rem;
  line-height: 1;
}

.journey-template-card__name {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text, #111827);
}

.journey-template-card__description {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--color-text-muted, #6b7280);
  line-height: 1.4;
}
</style>
