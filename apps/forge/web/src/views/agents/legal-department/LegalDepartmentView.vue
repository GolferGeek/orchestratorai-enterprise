<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button></ion-menu-button>
        </ion-buttons>
        <ion-title>Legal Department AI</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="handleHelp">
            <ion-icon :icon="helpCircleOutline" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <LegalDepartmentConversation
        :key="conversationId || 'new'"
        :conversation-id="conversationId"
        @browse-history="showBrowseModal = true"
      />
    </ion-content>

    <!-- Browse Previous Analyses Modal -->
    <DeliverablesBrowseModal
      :is-open="showBrowseModal"
      agent-slug="legal-department"
      agent-display-name="Legal Analysis"
      @close="showBrowseModal = false"
      @select="handleDeliverableSelect"
    />
  </ion-page>
</template>

<script lang="ts" setup>
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonMenuButton,
  IonButton,
  IonContent,
  IonIcon,
  alertController,
} from "@ionic/vue";
import { helpCircleOutline } from "ionicons/icons";
import LegalDepartmentConversation from "./LegalDepartmentConversation.vue";
import { DeliverablesBrowseModal } from "@/components/AgentDashboard";
import type { DeliverableSearchResult } from "@/services/deliverablesService";

const route = useRoute();
const router = useRouter();

const showBrowseModal = ref(false);

// Get conversationId from route query (if provided by parent)
const conversationId = computed(() => {
  return (route.query.conversationId as string) || undefined;
});

// Handle selecting a previous deliverable from the modal
function handleDeliverableSelect(deliverable: DeliverableSearchResult) {
  if (deliverable.conversationId) {
    router.push({
      path: "/app/agents/legal-department",
      query: { conversationId: deliverable.conversationId },
    });
  }
}

// Show help dialog
async function handleHelp() {
  const alert = await alertController.create({
    header: "Legal Department AI",
    message: `
      <p><strong>Upload a legal document</strong> (PDF, DOCX, or image) for AI-powered analysis.</p>
      <br/>
      <p><strong>What we analyze:</strong></p>
      <ul>
        <li>Key legal terms and clauses</li>
        <li>Potential risks and liabilities</li>
        <li>Compliance issues</li>
        <li>Actionable recommendations</li>
      </ul>
      <br/>
      <p><strong>Supported formats:</strong> PDF, DOCX, PNG, JPG (max 10MB)</p>
      <br/>
      <p><em>Note: This tool provides AI-assisted analysis and should not replace consultation with a licensed attorney.</em></p>
    `,
    buttons: ["Close"],
  });

  await alert.present();
}
</script>

<style scoped>

</style>
