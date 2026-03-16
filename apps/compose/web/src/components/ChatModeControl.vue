<template>
  <div class="chat-mode-control">
    <ion-item lines="none" class="compact-item">
      <ion-label class="label">Mode</ion-label>
      <ion-select
        interface="popover"
        :value="mode"
        @ionChange="onChange"
        class="compact-select"
      >
        <ion-select-option
          v-for="option in selectableModes"
          :key="option.value"
          :value="option.value"
          :disabled="option.disabled"
          :title="option.tooltip"
        >
          {{ option.label }}
        </ion-select-option>
      </ion-select>
    </ion-item>
  </div>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { IonItem, IonLabel, IonSelect, IonSelectOption } from "@ionic/vue";
import type { PrimaryChatMode, Agent } from "@/types/conversation";
import { DEFAULT_CHAT_MODES } from "@/types/conversation";
// analyticsService removed — Compose does not use client-side analytics tracking
import { useChatUiStore } from "@/stores/ui/chatUiStore";

// Migrated to conversationsStore + chatUiStore
const chatUiStore = useChatUiStore();

const mode = computed(() => chatUiStore.chatMode);

const BASE_MODE_OPTIONS: Array<{ value: PrimaryChatMode; label: string }> = [
  { value: "converse", label: "Converse" },
  { value: "plan", label: "Plan" },
  { value: "build", label: "Build" },
];

type SelectableMode = {
  value: PrimaryChatMode;
  label: string;
  disabled?: boolean;
  tooltip?: string;
};

// Helper to check if converse mode is supported
const isConverseSupported = (agent: Agent | undefined): boolean => {
  if (!agent) return false;

  // Check execution_capabilities - if can_converse is explicitly false, hide the button
  const capabilities = agent.execution_capabilities;
  if (capabilities && typeof capabilities.can_converse === "boolean") {
    return capabilities.can_converse === true;
  }

  // Default to true if not explicitly disabled
  return true;
};

// Helper to check if a mode is explicitly supported
const isModeSupported = (mode: "plan" | "build", agent: Agent | undefined): boolean => {
  if (!agent) return false;

  // FIRST: Check execution_capabilities - these are authoritative when present
  const capabilities = agent.execution_capabilities;
  if (capabilities) {
    const capability =
      mode === "plan" ? capabilities.can_plan : capabilities.can_build;
    if (typeof capability === "boolean") {
      return capability === true;
    }
  }

  // SECOND: Check agent type defaults (when no explicit capabilities)
  const agentType = agent.type;
  if (agentType === "rag-runner" || agentType === "api") {
    return false;
  }

  // THIRD: For other types, check structure fields as fallback
  if (mode === "plan") {
    return Boolean(agent.plan_structure);
  }
  if (mode === "build") {
    return Boolean(agent.deliverable_structure);
  }

  return false;
};

const selectableModes = computed<SelectableMode[]>(() => {
  const conv = chatUiStore.activeConversation;
  const allowed = conv?.allowedChatModes?.length
    ? conv.allowedChatModes
    : DEFAULT_CHAT_MODES;
  const agent = conv?.agent;

  return BASE_MODE_OPTIONS.filter((option) => {
    // Only show converse if allowed AND explicitly supported
    if (option.value === "converse") {
      return allowed.includes(option.value) && isConverseSupported(agent);
    }
    // Only show plan if explicitly supported
    if (option.value === "plan") {
      return allowed.includes(option.value) && isModeSupported("plan", agent);
    }
    // Only show build if explicitly supported
    if (option.value === "build") {
      return allowed.includes(option.value) && isModeSupported("build", agent);
    }
    return allowed.includes(option.value);
  }).map((option) => ({
    ...option,
    disabled: !allowed.includes(option.value),
  }));
});

function onChange(ev: CustomEvent) {
  const value = ev.detail.value as PrimaryChatMode;
  chatUiStore.setChatMode(value);
}
</script>
<style scoped>
.chat-mode-control {
  display: inline-flex;
}
.compact-item {
  --inner-padding-end: 0;
  --min-height: 36px;
  --padding-start: 8px;
  --padding-end: 8px;
}
.label {
  margin-right: 6px;
}
.compact-select {
  min-width: 120px;
}
</style>
