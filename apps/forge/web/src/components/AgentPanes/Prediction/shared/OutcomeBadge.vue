<template>
  <span class="outcome-badge" :class="badgeClass">
    {{ badgeLabel }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type OutcomeStatus = 'pending' | 'correct' | 'incorrect' | 'expired';

interface Props {
  status: OutcomeStatus;
}

const props = defineProps<Props>();

const badgeClass = computed(() => {
  switch (props.status) {
    case 'correct':
      return 'outcome-badge-success';
    case 'incorrect':
      return 'outcome-badge-danger';
    case 'pending':
      return 'outcome-badge-warning';
    case 'expired':
      return 'outcome-badge-neutral';
    default:
      return 'outcome-badge-neutral';
  }
});

const badgeLabel = computed(() => {
  switch (props.status) {
    case 'correct':
      return 'Correct';
    case 'incorrect':
      return 'Incorrect';
    case 'pending':
      return 'Pending';
    case 'expired':
      return 'Expired';
    default:
      return 'Unknown';
  }
});
</script>

<style scoped>
.outcome-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.outcome-badge-success {
  background-color: #d1fae5;
  color: #065f46;
}

.outcome-badge-danger {
  background-color: #fee2e2;
  color: #991b1b;
}

.outcome-badge-warning {
  background-color: #fef3c7;
  color: #92400e;
}

.outcome-badge-neutral {
  background-color: #e5e7eb;
  color: #374151;
}
</style>
