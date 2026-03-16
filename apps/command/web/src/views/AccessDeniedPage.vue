<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Access Denied</ion-title>
        <ion-buttons slot="start">
          <ion-button @click="goBack" fill="clear">
            <ion-icon :icon="arrowBackOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true">
      <div class="access-denied-container">
        <div class="access-denied-content">
          <!-- Icon -->
          <div class="access-denied-icon">
            <ion-icon :icon="lockClosedOutline" />
          </div>
          
          <!-- Main Message -->
          <h1 class="access-denied-title">Access Denied</h1>
          <p class="access-denied-message">
            You don't have permission to access this page.
          </p>
          
          <!-- Role Information -->
          <div v-if="auth.user" class="role-info">
            <p class="role-info-text">
              Your current roles: <strong>{{ userRolesText }}</strong>
            </p>
            <p v-if="requiredRoles.length > 0" class="required-roles-text">
              Required roles: <strong>{{ requiredRoles.join(', ') }}</strong>
            </p>
          </div>
          
          <!-- Actions -->
          <div class="access-denied-actions">
            <ion-button
              expand="block"
              color="secondary"
              @click="goToHome"
              class="action-button"
            >
              <ion-icon :icon="homeOutline" slot="start" />
              Go to Home
            </ion-button>
            
            <ion-button 
              expand="block" 
              fill="outline" 
              color="medium" 
              @click="goBack"
              class="action-button"
            >
              <ion-icon :icon="arrowBackOutline" slot="start" />
              Go Back
            </ion-button>
            
            <ion-button 
              expand="block" 
              fill="clear" 
              color="medium" 
              @click="contactAdmin"
              class="action-button"
            >
              <ion-icon :icon="mailOutline" slot="start" />
              Contact Administrator
            </ion-button>
          </div>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons, IonIcon,
  toastController
} from '@ionic/vue';
import {
  lockClosedOutline, arrowBackOutline, homeOutline, mailOutline
} from 'ionicons/icons';
import { useAuthStore } from '@/stores/rbacStore';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

// Get required roles from route query or default to empty array
const requiredRoles = computed(() => {
  const roles = route.query.requiredRoles as string;
  return roles ? roles.split(',') : [];
});

// Format user roles for display
const userRolesText = computed(() => {
  return auth.user?.roles?.join(', ') || 'No roles assigned';
});

// Navigation methods
const goBack = () => {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push('/app/home');
  }
};

const goToHome = () => {
  router.push('/app/home');
};

const contactAdmin = async () => {
  const toast = await toastController.create({
    message: 'Please contact your system administrator for access.',
    duration: 4000,
    color: 'primary',
    position: 'bottom',
    buttons: [
      {
        text: 'OK',
        role: 'cancel'
      }
    ]
  });
  await toast.present();
};
</script>

<style scoped>
.access-denied-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 2rem;
  background: linear-gradient(135deg, var(--ion-color-light) 0%, var(--ion-color-light-shade) 100%);
}

.access-denied-content {
  text-align: center;
  max-width: 500px;
  width: 100%;
  background: var(--ion-color-light);
  border-radius: 16px;
  padding: 3rem 2rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.access-denied-icon {
  margin-bottom: 2rem;
}

.access-denied-icon ion-icon {
  font-size: 5rem;
  color: var(--ion-color-danger);
}

.access-denied-title {
  font-size: 2rem;
  font-weight: 600;
  color: var(--ion-color-dark);
  margin: 0 0 1rem 0;
}

.access-denied-message {
  font-size: 1.1rem;
  color: var(--ion-color-medium);
  margin: 0 0 2rem 0;
  line-height: 1.5;
}

.role-info {
  background: var(--ion-color-light-shade);
  border-radius: 12px;
  padding: 1.5rem;
  margin: 2rem 0;
  border-left: 4px solid var(--ion-color-warning);
}

.role-info-text {
  margin: 0 0 0.5rem 0;
  color: var(--ion-color-dark);
  font-size: 0.95rem;
}

.required-roles-text {
  margin: 0;
  color: var(--ion-color-medium);
  font-size: 0.9rem;
}

.access-denied-actions {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.action-button {
  --border-radius: 12px;
  height: 48px;
  font-weight: 500;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .access-denied-container {
    background: linear-gradient(135deg, var(--ion-color-dark) 0%, var(--ion-color-dark-shade) 100%);
  }
  
  .access-denied-content {
    background: var(--ion-color-dark-tint);
  }
}

/* Responsive design */
@media (max-width: 768px) {
  .access-denied-container {
    padding: 1rem;
  }
  
  .access-denied-content {
    padding: 2rem 1.5rem;
  }
  
  .access-denied-title {
    font-size: 1.75rem;
  }
  
  .access-denied-icon ion-icon {
    font-size: 4rem;
  }
}
</style>
