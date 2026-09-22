<template>
  <div v-if="visible" class="privacy-indicators" :class="{ compact }">
    <!-- Blocked is the loudest state: the request never reached a provider. -->
    <span
      v-if="summary.status === 'blocked'"
      class="privacy-badge blocked"
      :title="blockedTitle"
    >
      <ion-icon :icon="banOutline" />
      <span v-if="!compact" class="badge-text">Blocked</span>
    </span>

    <span
      v-if="showPseudonyms"
      class="privacy-badge pseudonymized"
      :title="pseudonymTitle"
    >
      <ion-icon :icon="swapHorizontalOutline" />
      <span class="badge-text">
        {{ summary.pseudonymCount }}<template v-if="!compact">
          Pseudonym{{ summary.pseudonymCount === 1 ? '' : 's' }}</template>
      </span>
    </span>

    <span
      v-if="showRedactions"
      class="privacy-badge redacted"
      :title="redactionTitle"
    >
      <ion-icon :icon="eyeOffOutline" />
      <span class="badge-text">
        {{ summary.redactionCount }}<template v-if="!compact">
          Redacted</template>
      </span>
    </span>

    <span v-if="showFlagged" class="privacy-badge flagged" :title="flaggedTitle">
      <ion-icon :icon="flagOutline" />
      <span class="badge-text">
        {{ summary.flaggedCount }}<template v-if="!compact">
          Flagged</template>
      </span>
    </span>

    <span
      v-if="showRouting"
      class="privacy-badge routing"
      :class="summary.routing"
      :title="routingTitle"
    >
      <ion-icon
        :icon="summary.routing === 'local' ? shieldCheckmarkOutline : cloudOutline"
      />
      <span v-if="!compact" class="badge-text">
        {{ summary.routing === 'local' ? 'Local' : 'External' }}
      </span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IonIcon } from '@ionic/vue';
import {
  swapHorizontalOutline,
  eyeOffOutline,
  flagOutline,
  shieldCheckmarkOutline,
  cloudOutline,
  banOutline,
} from 'ionicons/icons';
import { usePrivacyIndicatorsStore } from '@/stores/privacyIndicatorsStore';
import type { PrivacySummary } from '../../types/privacy';

const props = defineProps<{
  summary?: PrivacySummary | null;
}>();

const store = usePrivacyIndicatorsStore();

const compact = computed(() => store.preferences.compact);

/**
 * A message that went out clean gets no badges at all — an always-present row
 * of zeroes would train people to ignore it, which defeats the point.
 */
const hasSomethingToSay = computed(() => {
  const s = props.summary;
  if (!s) return false;
  return (
    s.status === 'blocked' ||
    s.pseudonymCount > 0 ||
    s.redactionCount > 0 ||
    s.flaggedCount > 0 ||
    // Local routing is worth stating on its own: nothing left the building.
    (s.routing === 'local' && store.preferences.showRouting)
  );
});

const visible = computed(() => store.enabled && hasSomethingToSay.value);

// Non-null inside the template, which only renders when `visible` is true.
const summary = computed(() => props.summary as PrivacySummary);

const showPseudonyms = computed(
  () => store.preferences.showPseudonyms && (props.summary?.pseudonymCount ?? 0) > 0,
);
const showRedactions = computed(
  () => store.preferences.showRedactions && (props.summary?.redactionCount ?? 0) > 0,
);
const showFlagged = computed(
  () => store.preferences.showFlagged && (props.summary?.flaggedCount ?? 0) > 0,
);
const showRouting = computed(() => store.preferences.showRouting);

const typeList = computed(() =>
  (props.summary?.dataTypes ?? []).join(', ').replace(/_/g, ' '),
);

const pseudonymTitle = computed(() => {
  const n = props.summary?.pseudonymCount ?? 0;
  const restored = props.summary?.reversed
    ? ' They were restored in this reply.'
    : '';
  return `${n} value${n === 1 ? '' : 's'} replaced with a pseudonym before the model saw this message.${restored}`;
});

const redactionTitle = computed(() => {
  const n = props.summary?.redactionCount ?? 0;
  return `${n} match${n === 1 ? '' : 'es'} redacted by a pattern after pseudonymization.`;
});

const flaggedTitle = computed(() => {
  const n = props.summary?.flaggedCount ?? 0;
  const types = typeList.value ? ` (${typeList.value})` : '';
  return `${n} piece${n === 1 ? '' : 's'} of personal information detected${types}.`;
});

const routingTitle = computed(() =>
  props.summary?.routing === 'local'
    ? 'Handled by a local model — this message never left your infrastructure.'
    : 'Sent to an external provider, sanitized first.',
);

const blockedTitle = computed(
  () =>
    'This message contained information that policy will not send to a model. Nothing was sent.',
);
</script>

<style scoped>
.privacy-indicators {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.35rem;
}

.privacy-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 500;
  line-height: 1.5;
  border: 1px solid transparent;
  cursor: default;
  white-space: nowrap;
}

.privacy-badge ion-icon {
  font-size: 0.85rem;
}

.compact .privacy-badge {
  padding: 0.1rem 0.3rem;
  font-size: 0.65rem;
}

.badge-text {
  white-space: nowrap;
}

.pseudonymized {
  color: var(--ion-color-primary);
  background: rgba(var(--ion-color-primary-rgb), 0.1);
  border-color: rgba(var(--ion-color-primary-rgb), 0.28);
}

.redacted {
  color: var(--ion-color-tertiary, #6030ff);
  background: rgba(var(--ion-color-tertiary-rgb, 96, 48, 255), 0.1);
  border-color: rgba(var(--ion-color-tertiary-rgb, 96, 48, 255), 0.28);
}

.flagged {
  color: var(--ion-color-warning-shade, #b88600);
  background: rgba(var(--ion-color-warning-rgb), 0.12);
  border-color: rgba(var(--ion-color-warning-rgb), 0.3);
}

.routing.local {
  color: var(--ion-color-success-shade, #1a7a4c);
  background: rgba(var(--ion-color-success-rgb), 0.12);
  border-color: rgba(var(--ion-color-success-rgb), 0.3);
}

.routing.external {
  color: var(--dark-text-muted, #6b7280);
  background: rgba(var(--ion-color-medium-rgb), 0.12);
  border-color: rgba(var(--ion-color-medium-rgb), 0.28);
}

.blocked {
  color: var(--ion-color-danger);
  background: rgba(var(--ion-color-danger-rgb), 0.12);
  border-color: rgba(var(--ion-color-danger-rgb), 0.35);
}
</style>
