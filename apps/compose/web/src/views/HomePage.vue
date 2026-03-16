<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button :auto-hide="false" v-if="auth.isAuthenticated"></ion-menu-button>
        </ion-buttons>
        <ion-title>{{ pageTitle }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">{{ pageTitle }}</ion-title>
        </ion-toolbar>
      </ion-header>
      <!-- Authentication Check -->
      <div v-if="!auth.isAuthenticated" class="auth-required">
        <ion-icon :icon="lockClosedOutline" class="auth-icon"></ion-icon>
        <h2>Authentication Required</h2>
        <p>Please contact your administrator to access Compose.</p>
      </div>
      <!-- Agent Conversation View -->
      <div v-else-if="chatUiStore.hasActiveConversation" class="conversation-container">
        <ConversationTabs />
      </div>
      <!-- Welcome/Empty State -->
      <div v-else class="welcome-container">
        <div class="welcome-content">
          <ion-icon :icon="chatbubblesOutline" class="welcome-icon"></ion-icon>
          <h2>Compose</h2>
          <p>Select an agent from the sidebar to start a conversation, or build a custom pipeline.</p>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue';
import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonButtons,
  IonMenuButton,
  IonIcon,
} from '@ionic/vue';
import {
  lockClosedOutline,
  chatbubblesOutline,
} from 'ionicons/icons';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/rbacStore';
import { useConversationsStore } from '@/stores/conversationsStore';
import { useChatUiStore } from '@/stores/ui/chatUiStore';
import { conversationLoadingService } from '@/services/conversationLoadingService';
import { useUserPreferencesStore } from '@/stores/userPreferencesStore';
import ConversationTabs from '@/components/ConversationTabs.vue';
const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const conversationsStore = useConversationsStore();
const chatUiStore = useChatUiStore();
const userPreferencesStore = useUserPreferencesStore();
// Computed properties
const pageTitle = computed(() => {
  const activeConvId = chatUiStore.activeConversationId;
  if (activeConvId) {
    const activeConversation = conversationsStore.conversationById(activeConvId);
    if (activeConversation) {
      return activeConversation.title || `Chat with ${activeConversation.agentName}`;
    }
  }
  return 'Orchestrator AI';
});
// Dark mode state and functionality
// Handle conversation opening from query parameters
const handleConversationFromQuery = async () => {
  const conversationId = route.query.conversationId as string;
  if (conversationId && auth.isAuthenticated) {
    // Delegate to service - all business logic lives there
    const result = await conversationLoadingService.loadConversationFromQuery(
      conversationId,
      router,
      {
        name: typeof route.name === 'string' ? route.name : null,
        params: route.params,
        query: route.query
      }
    );

    if (!result.success) {
      console.error('Failed to load conversation:', result.error);
    }
  }
};
// Watch for query parameter changes
watch(() => route.query.conversationId, handleConversationFromQuery, { immediate: true });

// Initialize user preferences store
onMounted(async () => {
  await userPreferencesStore.initializePreferences();
});

// Cleanup function to clear conversation flag when leaving the page
onUnmounted(() => {
  // Clear the active conversation flag when leaving the home page
  // This allows admin users to be redirected back to admin settings when appropriate
  sessionStorage.removeItem('activeConversation');
});


</script>
<style scoped>
.auth-required,
.welcome-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
  text-align: center;
}
.welcome-content {
  max-width: 500px;
}
.auth-icon,
.welcome-icon {
  font-size: 4rem;
  color: var(--ion-color-primary);
  margin-bottom: 1.5rem;
}
.auth-required h2,
.welcome-content h2 {
  color: var(--ion-color-primary);
  margin-bottom: 1rem;
  font-size: 2rem;
  font-weight: 600;
}
.auth-required p,
.welcome-content p {
  color: var(--ion-color-medium);
  margin-bottom: 2rem;
  font-size: 1.1rem;
  line-height: 1.6;
}
.quick-nav {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: center;
}
.quick-nav ion-button {
  width: 100%;
  max-width: 300px;
  --border-radius: 12px;
  --padding-top: 1rem;
  --padding-bottom: 1rem;
}
.conversation-container,
.dashboard-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}
/* Responsive design */
@media (max-width: 768px) {
  .auth-required,
  .welcome-container {
    padding: 1rem;
  }
  .auth-required h2,
  .welcome-content h2 {
    font-size: 1.5rem;
  }
  .auth-required p,
  .welcome-content p {
    font-size: 1rem;
  }
  .quick-nav {
    gap: 0.75rem;
  }
}
/* Dark theme support */
@media (prefers-color-scheme: dark) {
  .auth-icon,
  .welcome-icon {
    color: var(--ion-color-primary-tint);
  }
}
</style> 