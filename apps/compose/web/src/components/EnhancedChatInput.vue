<template>
  <div class="enhanced-chat-input">
    <!-- LLM Preferences Panel (collapsible) -->
    <div v-if="showLLMPanel" class="llm-panel">
      <div class="panel-tabs">
        <button 
          @click="activeTab = 'model'" 
          :class="{ active: activeTab === 'model' }"
          class="tab-button"
        >
          AI Model
        </button>
        <button 
          @click="activeTab = 'behavior'" 
          :class="{ active: activeTab === 'behavior' }"
          class="tab-button"
        >
          Behavior
        </button>
        <button @click="showLLMPanel = false" class="close-panel">×</button>
      </div>
      <div class="panel-content">
        <LLMSelector v-if="activeTab === 'model'">
          <template #actions>
            <ion-button
              color="secondary"
              size="small"
              @click="applyLLMSelection"
            >
              <ion-icon :icon="checkmarkOutline" slot="start" />
              Apply Selection
            </ion-button>
          </template>
        </LLMSelector>
        <CIDAFMControls v-if="activeTab === 'behavior'" />
      </div>
    </div>
    <!-- Main Chat Input -->
    <ion-toolbar color="light" class="chat-input-toolbar">
      <!-- LLM Status Display -->
      <div class="llm-status" slot="start">
        <button @click="showLLMPanel = !showLLMPanel" class="llm-toggle-btn">
          <div class="llm-info">
            <div class="provider-name">
              {{ llmStore.selectedProvider?.name || 'Default' }}
            </div>
            <div class="model-name">
              {{ llmStore.selectedModel?.name || 'GPT-4o-mini' }}
            </div>
          </div>
          <ion-icon :icon="chevronUpOutline" :class="{ rotated: !showLLMPanel }"></ion-icon>
        </button>
      </div>
      <!-- Message Input -->
      <ion-textarea
        v-model="inputText"
        placeholder="Type a message..."
        :auto-grow="true"
        class="chat-textarea"
        :rows="1"
        :disabled="false"
        @keydown.enter.prevent="handleEnterKey"
      ></ion-textarea>
      <!-- Input Buttons -->
      <ion-buttons slot="end" class="input-buttons">
        <!-- Cost Estimate -->
        <div v-if="showCostEstimate && estimatedCost" class="cost-estimate">
          ~${{ estimatedCost }}
        </div>
        <!-- Conversational Speech Button (moved to middle position) -->
        <ConversationalSpeechButton
          v-if="currentConversationId"
          :conversation-id="currentConversationId"
          :agent-name="currentConversation?.agent?.name"
          :agent-type="currentConversation?.agent?.type || 'generalists'"
          :disabled="!currentConversationId"
          @conversation-start="handleConversationStart"
          @conversation-end="handleConversationEnd"
          @error="handleSpeechError"
        />
        <!-- Mode-aware Send Button -->
        <ChatModeSendButton
          :disabled="!inputText.trim()"
          @send="sendMessage"
        />
      </ion-buttons>
    </ion-toolbar>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, defineEmits, defineProps, watch, onMounted } from 'vue';
import { IonTextarea, IonButtons, IonButton, IonIcon, IonToolbar, toastController } from '@ionic/vue';
import { chevronUpOutline, checkmarkOutline } from 'ionicons/icons';
import { useUiStore } from '../stores/uiStore';
import { useLLMPreferencesStore } from '../stores/llmPreferencesStore';
import { useChatUiStore } from '../stores/ui/chatUiStore';
import LLMSelector from './LLMSelector.vue';
import CIDAFMControls from './CIDAFMControls.vue';
import ConversationalSpeechButton from './ConversationalSpeechButton.vue';
import ChatModeSendButton from './ChatModeSendButton.vue';
import { useValidation, ValidationRules } from '@/composables/useValidation';
import type { AgentChatMode } from '@/types/conversation';
const props = defineProps<{
  conversationId?: string;
}>();

const inputText = ref('');
const showLLMPanel = ref(false);
const activeTab = ref<'model' | 'behavior'>('model');
const showCostEstimate = ref(true);
const uiStore = useUiStore();
const llmStore = useLLMPreferencesStore();
const chatUiStore = useChatUiStore();
const validation = useValidation();

// Get current conversation ID from props or store
const currentConversationId = computed(() => {
  return props.conversationId || chatUiStore.activeConversationId;
});

// Get current conversation for agent info
const currentConversation = computed(() => {
  if (!currentConversationId.value) return null;
  return chatUiStore.activeConversation;
});

// Setup validation rules
onMounted(() => {
  validation.addRule('message', ValidationRules.required('Message cannot be empty'));
  validation.addRule('message', ValidationRules.maxLength(4000, 'Message must not exceed 4000 characters'));
  validation.addRule('message', ValidationRules.security({ message: 'Potentially unsafe content detected in message' }));
  validation.addRule('message', ValidationRules.sanitizeApiInput());
});

// Speech event handlers
const handleConversationStart = () => {
  // Conversational mode no longer affects the send button
  inputText.value = ''; // Clear text input when starting conversation
};

const handleConversationEnd = () => {
  // Conversational mode no longer affects the send button
};

const handleSpeechError = (error: unknown) => {
  presentToast(`Speech error: ${error instanceof Error ? error.message : String(error)}`, 3000, 'danger');
  // Conversational mode no longer affects the send button
};

const presentToast = async (message: string, duration: number = 2000, color: string = 'warning') => {
  const toast = await toastController.create({
    message: message,
    duration: duration,
    position: 'bottom',
    color: color,
  });
  await toast.present();
};
const emit = defineEmits<{
  (e: 'sendMessage', text: string, llmSelection?: { model: string; provider: string }): void;
}>();
// Computed properties
const estimatedCost = computed(() => {
  if (!inputText.value.trim() || !llmStore.selectedModel) return null;
  const textLength = inputText.value.length;
  const estimatedTokens = Math.ceil(textLength / 4); // Rough estimation
  const inputCost = llmStore.selectedModel.pricingInputPer1k || 0;
  const estimatedOutputTokens = estimatedTokens * 0.5; // Assume response is half the input
  const outputCost = llmStore.selectedModel.pricingOutputPer1k || 0;
  const totalCost = (estimatedTokens / 1000) * inputCost + (estimatedOutputTokens / 1000) * outputCost;
  return totalCost > 0.001 ? totalCost.toFixed(4) : '< 0.001';
});
// Event handlers
const sendMessage = async (mode?: AgentChatMode) => {
  if (!inputText.value.trim()) return;

  // Validate and sanitize the message before sending
  const validationResult = await validation.validate('message', inputText.value.trim());

  if (!validationResult.isValid) {
    const errorMessages = validationResult.errors.map(e => e.message).join(', ');
    presentToast(`Message validation failed: ${errorMessages}`, 3000, 'danger');
    return;
  }

  // Use the sanitized value if available
  const messageToSend = (validationResult.sanitizedValue as string) || inputText.value.trim();
  const llmSelection = llmStore.currentLLMSelection;

  // If mode is provided, set it before sending
  if (mode && (mode === 'converse' || mode === 'plan' || mode === 'build')) {
    chatUiStore.setChatMode(mode);
  }

  // Convert LLMSelection to expected format
  const llmSelectionParam = llmSelection && llmSelection.modelName && llmSelection.providerName
    ? { model: llmSelection.modelName, provider: llmSelection.providerName }
    : undefined;

  emit('sendMessage', messageToSend, llmSelectionParam);
  inputText.value = '';
};

const applyLLMSelection = async () => {
  // Show confirmation that selection was applied
  const provider = llmStore.selectedProvider?.name || 'Unknown';
  const model = llmStore.selectedModel?.name || 'Unknown';
  
  const toast = await toastController.create({
    message: `✅ LLM selection applied: ${provider}/${model}`,
    duration: 2000,
    position: 'top',
    color: 'success'
  });
  await toast.present();
  
  // Optionally close the LLM panel after applying
  showLLMPanel.value = false;
};

const handleEnterKey = (event: KeyboardEvent) => {
  if (!event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
};
// Watch for conversational mode changes to disable/enable text input
watch(() => uiStore.isConversationalMode, (isConversational) => {
  if (isConversational) {
    inputText.value = ''; // Clear input when entering conversational mode
  }
});
</script>
<style scoped>
.enhanced-chat-input {
  display: flex;
  flex-direction: column;
}
.llm-panel {
  background: white;
  border-top: 1px solid #e0e0e0;
  max-height: 60vh;
  overflow-y: auto;
}
.panel-tabs {
  display: flex;
  background: #f5f5f5;
  border-bottom: 1px solid #e0e0e0;
  position: relative;
}
.tab-button {
  flex: 1;
  padding: 0.75rem 1rem;
  border: none;
  background: transparent;
  cursor: pointer;
  font-weight: 500;
  color: #666;
  transition: all 0.2s ease;
}
.tab-button.active {
  background: white;
  color: #3498db;
  border-bottom: 2px solid #3498db;
}
.close-panel {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #666;
  width: 2.75rem; /* 44px minimum touch target */
  height: 2.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.panel-content {
  padding: 0;
}
.chat-input-toolbar {
  --padding-start: 8px;
  --padding-end: 8px;
  --padding-top: 4px;
  --padding-bottom: 4px;
  min-height: auto;
  display: flex;
  align-items: center;
}
.llm-status {
  margin-right: 0.5rem;
}
.llm-toggle-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 120px;
  min-height: 2.75rem; /* 44px minimum touch target */
}
.llm-toggle-btn:hover {
  border-color: #3498db;
  background: #f8fbff;
}
.llm-info {
  flex: 1;
  text-align: left;
}
.provider-name {
  font-size: 0.75rem;
  color: #666;
  line-height: 1;
}
.model-name {
  font-size: 0.8rem;
  font-weight: 500;
  color: #333;
  line-height: 1.2;
}
.llm-toggle-btn ion-icon {
  transition: transform 0.2s ease;
}
.llm-toggle-btn ion-icon.rotated {
  transform: rotate(180deg);
}
.chat-textarea {
  flex-grow: 1;
  border: 1px solid var(--ion-color-medium-shade);
  border-radius: 20px;
  --padding-top: 8px !important; 
  --padding-bottom: 8px !important;
  --padding-start: 12px !important;
  --padding-end: 12px !important;
  line-height: 1.4;
  max-height: 100px;
  align-self: center;
  margin-right: 4px;
}
.input-buttons {
  display: flex;
  align-items: center;
  gap: 0.25rem; /* Tighter spacing between remaining buttons */
}
.cost-estimate {
  font-size: 0.7rem;
  color: #666;
  padding: 0.25rem 0.5rem;
  background: #f5f5f5;
  border-radius: 12px;
  white-space: nowrap;
}
.custom-button-padding {
  --padding-start: 8px;
  --padding-end: 8px;
  height: 2.75rem; /* 44px minimum touch target */
}
/* Mobile responsiveness */
@media (max-width: 768px) {
  .llm-toggle-btn {
    min-width: 100px;
    padding: 0.75rem 0.5rem; /* Adjust padding for smaller screens */
  }
  
  .input-buttons {
    gap: 0.5rem; /* Adjusted spacing on mobile for remaining buttons */
  }
  
  .chat-input-toolbar {
    --padding-start: 0.75rem;
    --padding-end: 0.75rem;
    --padding-top: 0.5rem;
    --padding-bottom: 0.5rem;
  }
  
  /* Ensure touch targets are thumb-friendly on mobile */
  .custom-button-padding {
    --padding-start: 0.75rem;
    --padding-end: 0.75rem;
    min-width: 2.75rem; /* Square touch target */
  }
  .provider-name {
    font-size: 0.7rem;
  }
  .model-name {
    font-size: 0.75rem;
  }
  .llm-panel {
    max-height: 50vh;
  }
  .cost-estimate {
    display: none; /* Hide on mobile to save space */
  }
}
</style>
