<template>
  <div class="legal-department-tab">
    <LegalDepartmentConversation
      :conversation-id="conversation?.id"
    />
  </div>
</template>

<script lang="ts" setup>
import LegalDepartmentConversation from '@/views/agents/legal-department/LegalDepartmentConversation.vue';
import type { AgentConversation } from '@/types/conversation';

interface Props {
  conversation: AgentConversation | null;
}

defineProps<Props>();
</script>

<style scoped>
.legal-department-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
}
</style>
