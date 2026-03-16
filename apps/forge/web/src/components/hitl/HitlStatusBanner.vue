<template>
  <div
    v-if="shouldShow"
    class="hitl-banner"
    :class="bannerClasses"
  >
    <div class="hitl-banner__content">
      <div class="hitl-banner__icon">{{ icon }}</div>
      <div class="hitl-banner__text">
        <div class="hitl-banner__title">{{ title }}</div>
        <div class="hitl-banner__description">{{ description }}</div>
      </div>
      <div class="hitl-banner__status">
        <span class="hitl-banner__status-badge" :class="statusBadgeClasses">
          {{ statusText }}
        </span>
      </div>
    </div>

    <!-- Action button to open approval modal -->
    <ion-button
      v-if="hitlPending"
      size="small"
      fill="outline"
      @click="$emit('review')"
      class="hitl-banner__action"
    >
      Review Content
    </ion-button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IonButton } from '@ionic/vue';

interface Props {
  /** Current HITL status from the agent */
  status?: 'started' | 'generating' | 'hitl_waiting' | 'completed' | 'rejected' | 'failed';
  /** Whether HITL is pending review */
  hitlPending?: boolean;
  /** Topic/subject of the content being generated */
  topic?: string;
  /** Agent name for display */
  agentName?: string;
  /** Force show the banner regardless of status */
  forceShow?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  status: undefined,
  hitlPending: false,
  topic: '',
  agentName: 'Extended Post Writer',
  forceShow: false,
});

defineEmits<{
  review: [];
}>();

// Computed properties
const shouldShow = computed(() => {
  if (props.forceShow) return true;
  return props.hitlPending || props.status === 'hitl_waiting';
});

const icon = computed(() => {
  switch (props.status) {
    case 'hitl_waiting':
      return '⏸️';
    case 'completed':
      return '✅';
    case 'rejected':
      return '❌';
    case 'failed':
      return '⚠️';
    case 'generating':
      return '⏳';
    default:
      return '👤';
  }
});

const title = computed(() => {
  if (props.status === 'hitl_waiting' || props.hitlPending) {
    return 'Human Review Required';
  }
  if (props.status === 'completed') {
    return 'Content Approved';
  }
  if (props.status === 'rejected') {
    return 'Content Rejected';
  }
  if (props.status === 'failed') {
    return 'Generation Failed';
  }
  if (props.status === 'generating') {
    return 'Generating Content...';
  }
  return 'Human-in-the-Loop';
});

const description = computed(() => {
  const topicText = props.topic ? ` for "${props.topic}"` : '';

  if (props.status === 'hitl_waiting' || props.hitlPending) {
    return `${props.agentName} has generated content${topicText} and is waiting for your approval.`;
  }
  if (props.status === 'completed') {
    return `Content${topicText} has been approved and finalized.`;
  }
  if (props.status === 'rejected') {
    return `Content${topicText} was rejected.`;
  }
  if (props.status === 'failed') {
    return `Content generation${topicText} encountered an error.`;
  }
  if (props.status === 'generating') {
    return `${props.agentName} is generating content${topicText}...`;
  }
  return `${props.agentName} requires human approval before completing.`;
});

const statusText = computed(() => {
  if (props.status === 'hitl_waiting' || props.hitlPending) {
    return 'PENDING REVIEW';
  }
  if (props.status === 'completed') {
    return 'APPROVED';
  }
  if (props.status === 'rejected') {
    return 'REJECTED';
  }
  if (props.status === 'failed') {
    return 'FAILED';
  }
  if (props.status === 'generating') {
    return 'GENERATING';
  }
  return 'HITL';
});

const bannerClasses = computed(() => {
  const classes: string[] = [];

  if (props.status === 'hitl_waiting' || props.hitlPending) {
    classes.push('hitl-banner--warning');
  } else if (props.status === 'completed') {
    classes.push('hitl-banner--success');
  } else if (props.status === 'rejected' || props.status === 'failed') {
    classes.push('hitl-banner--danger');
  } else if (props.status === 'generating') {
    classes.push('hitl-banner--info');
  } else {
    classes.push('hitl-banner--info');
  }

  return classes;
});

const statusBadgeClasses = computed(() => {
  if (props.status === 'hitl_waiting' || props.hitlPending) {
    return 'hitl-banner__status-badge--warning';
  }
  if (props.status === 'completed') {
    return 'hitl-banner__status-badge--success';
  }
  if (props.status === 'rejected' || props.status === 'failed') {
    return 'hitl-banner__status-badge--danger';
  }
  return 'hitl-banner__status-badge--info';
});
</script>

<style scoped>
.hitl-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  border: 1px solid;
  position: relative;
  transition: all 0.3s ease;
}

.hitl-banner__content {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex: 1;
}

.hitl-banner__icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.hitl-banner__text {
  flex: 1;
}

.hitl-banner__title {
  font-weight: 600;
  font-size: 1rem;
  margin-bottom: 0.25rem;
}

.hitl-banner__description {
  font-size: 0.9rem;
  line-height: 1.4;
  opacity: 0.9;
}

.hitl-banner__status {
  flex-shrink: 0;
  margin-right: 1rem;
}

.hitl-banner__status-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.hitl-banner__status-badge--warning {
  background: rgba(133, 100, 4, 0.1);
  color: #856404;
  border: 1px solid rgba(133, 100, 4, 0.2);
}

.hitl-banner__status-badge--success {
  background: rgba(21, 87, 36, 0.1);
  color: #155724;
  border: 1px solid rgba(21, 87, 36, 0.2);
}

.hitl-banner__status-badge--danger {
  background: rgba(114, 28, 36, 0.1);
  color: #721c24;
  border: 1px solid rgba(114, 28, 36, 0.2);
}

.hitl-banner__status-badge--info {
  background: rgba(12, 84, 96, 0.1);
  color: #0c5460;
  border: 1px solid rgba(12, 84, 96, 0.2);
}

.hitl-banner__action {
  flex-shrink: 0;
}

/* Variant styles */
.hitl-banner--warning {
  background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%);
  color: #856404;
  border-color: #ffeaa7;
}

.hitl-banner--success {
  background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%);
  color: #155724;
  border-color: #c3e6cb;
}

.hitl-banner--danger {
  background: linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%);
  color: #721c24;
  border-color: #f5c6cb;
}

.hitl-banner--info {
  background: linear-gradient(135deg, #d1ecf1 0%, #bee5eb 100%);
  color: #0c5460;
  border-color: #bee5eb;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .hitl-banner {
    flex-direction: column;
    gap: 1rem;
    padding: 0.75rem;
  }

  .hitl-banner__content {
    gap: 0.75rem;
  }

  .hitl-banner__icon {
    font-size: 1.25rem;
  }

  .hitl-banner__title {
    font-size: 0.9rem;
  }

  .hitl-banner__description {
    font-size: 0.8rem;
  }

  .hitl-banner__status {
    margin-right: 0;
  }

  .hitl-banner__action {
    width: 100%;
  }
}
</style>
