<template>
  <div class="risk-sidebar">
    <div class="sidebar-header">
      <h3>Subjects</h3>
      <div class="header-actions">
        <span class="subject-count">{{ subjects.length }}</span>
        <button class="add-btn" @click="$emit('add-subject')" title="Add new subject">+</button>
      </div>
    </div>

    <div class="search-box">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search subjects..."
        class="search-input"
      />
    </div>

    <div class="subject-list">
      <div
        v-for="subject in filteredSubjects"
        :key="subject.id"
        class="subject-item"
        :class="{ selected: subject.id === selectedSubjectId }"
        @click="$emit('select', subject.id)"
      >
        <div class="subject-main">
          <span class="subject-identifier">{{ subject.identifier }}</span>
          <span class="subject-name">{{ subject.name }}</span>
        </div>
        <div class="subject-score" v-if="getScore(subject.id)">
          <RiskScoreBadge :score="getScore(subject.id)!.score" />
        </div>
        <div class="subject-meta">
          <span class="subject-type">{{ subject.subjectType }}</span>
          <span v-if="isStale(subject.id)" class="stale-badge">Stale</span>
        </div>
      </div>

      <div v-if="filteredSubjects.length === 0" class="no-subjects">
        <p v-if="searchQuery">No subjects match "{{ searchQuery }}"</p>
        <template v-else>
          <p>No subjects configured</p>
          <button class="add-first-btn" @click="$emit('add-subject')">+ Add Subject</button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { RiskSubject, ActiveCompositeScoreView } from '@/types/risk-agent';
import RiskScoreBadge from './shared/RiskScoreBadge.vue';

interface Props {
  subjects: RiskSubject[];
  compositeScores: ActiveCompositeScoreView[];
  selectedSubjectId?: string;
}

const props = defineProps<Props>();

defineEmits<{
  (e: 'select', subjectId: string): void;
  (e: 'add-subject'): void;
}>();

const searchQuery = ref('');

const filteredSubjects = computed(() => {
  if (!searchQuery.value) return props.subjects;

  const query = searchQuery.value.toLowerCase();
  return props.subjects.filter(
    (s) =>
      s.name.toLowerCase().includes(query) ||
      s.identifier.toLowerCase().includes(query)
  );
});

function getScore(subjectId: string): ActiveCompositeScoreView | undefined {
  return props.compositeScores.find((s) => s.subjectId === subjectId);
}

function isStale(subjectId: string): boolean {
  const score = getScore(subjectId);
  return score ? score.ageHours > 168 : false; // 7 days
}
</script>

<style scoped>
.risk-sidebar {
  width: 280px;
  flex-shrink: 0;
  background: var(--ion-card-background, #fff);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--ion-border-color, #e0e0e0);
}

.sidebar-header h3 {
  margin: 0;
  font-size: 1rem;
}

.subject-count {
  background: var(--ion-color-light, #f4f5f8);
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-size: 0.75rem;
}

.search-box {
  padding: 0.75rem;
  border-bottom: 1px solid var(--ion-border-color, #e0e0e0);
}

.search-input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--ion-border-color, #e0e0e0);
  border-radius: 4px;
  font-size: 0.875rem;
  color: var(--ion-text-color, #1f2937);
  background: var(--ion-card-background, #fff);
}

.search-input:focus {
  outline: none;
  border-color: var(--ion-color-primary, #3880ff);
}

.subject-list {
  flex: 1;
  overflow-y: auto;
}

.subject-item {
  padding: 0.75rem 1rem;
  cursor: pointer;
  border-bottom: 1px solid var(--ion-border-color, #e0e0e0);
  transition: background-color 0.2s;
}

.subject-item:hover {
  background: var(--ion-color-light, #f4f5f8);
}

.subject-item.selected {
  background: color-mix(in srgb, var(--ion-color-primary, #a87c4f) 15%, transparent);
  border-left: 3px solid var(--ion-color-primary, #a87c4f);
}

.subject-main {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.subject-identifier {
  font-weight: 600;
  font-size: 0.875rem;
}

.subject-name {
  font-size: 0.75rem;
  color: var(--ion-color-medium, #666);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.subject-score {
  margin-top: 0.5rem;
}

.subject-meta {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.subject-type {
  font-size: 0.625rem;
  text-transform: uppercase;
  color: var(--ion-color-medium, #666);
  background: var(--ion-color-light, #f4f5f8);
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
}

.stale-badge {
  font-size: 0.625rem;
  text-transform: uppercase;
  color: var(--ion-color-warning-contrast, #fff);
  background: var(--ion-color-warning, #ffc409);
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
}

.no-subjects {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--ion-color-medium, #666);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.add-btn {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: none;
  background: var(--ion-color-primary, #a87c4f);
  color: white;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.add-btn:hover {
  background: var(--ion-color-primary-shade, #8f693f);
}

.add-first-btn {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  border: none;
  background: var(--ion-color-primary, #a87c4f);
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.add-first-btn:hover {
  background: var(--ion-color-primary-shade, #8f693f);
}

/* Dark mode overrides */
html.ion-palette-dark .risk-sidebar,
html[data-theme="dark"] .risk-sidebar {
  background: var(--dark-bg-tertiary);
}

html.ion-palette-dark .risk-sidebar .search-input,
html[data-theme="dark"] .risk-sidebar .search-input {
  background: var(--dark-bg-secondary);
  color: var(--dark-text-secondary);
  border-color: var(--dark-border-primary);
}

html.ion-palette-dark .risk-sidebar .search-input::placeholder,
html[data-theme="dark"] .risk-sidebar .search-input::placeholder {
  color: var(--dark-text-muted);
}

html.ion-palette-dark .risk-sidebar .subject-count,
html[data-theme="dark"] .risk-sidebar .subject-count {
  background: var(--dark-bg-quaternary);
  color: var(--dark-text-tertiary);
}

html.ion-palette-dark .risk-sidebar .subject-type,
html[data-theme="dark"] .risk-sidebar .subject-type {
  background: var(--dark-bg-quaternary);
  color: var(--dark-text-muted);
}

html.ion-palette-dark .risk-sidebar .subject-item:hover,
html[data-theme="dark"] .risk-sidebar .subject-item:hover {
  background: var(--dark-bg-quaternary);
}

html.ion-palette-dark .risk-sidebar .subject-item.selected,
html[data-theme="dark"] .risk-sidebar .subject-item.selected {
  background: color-mix(in srgb, var(--dark-accent-primary) 20%, var(--dark-bg-tertiary));
}

html.ion-palette-dark .risk-sidebar .sidebar-header,
html[data-theme="dark"] .risk-sidebar .sidebar-header {
  border-color: var(--dark-border-subtle);
}

html.ion-palette-dark .risk-sidebar .search-box,
html[data-theme="dark"] .risk-sidebar .search-box {
  border-color: var(--dark-border-subtle);
}

html.ion-palette-dark .risk-sidebar .subject-item,
html[data-theme="dark"] .risk-sidebar .subject-item {
  border-color: var(--dark-border-subtle);
}
</style>
