<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Login</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <!-- OIDC provider: single sign-on button -->
      <template v-if="isOidcProvider">
        <div class="ion-padding">
          <ion-button
            expand="block"
            :disabled="auth.isLoading"
            @click="performOidcLogin"
          >
            <ion-spinner
              v-if="auth.isLoading"
              name="crescent"
              slot="start"
            ></ion-spinner>
            Sign in with {{ oidcProviderLabel }}
          </ion-button>
          <ion-text color="danger" v-if="auth.error" class="ion-padding-top">{{
            auth.error
          }}</ion-text>
        </div>
      </template>

      <!-- Credential provider: email/password form -->
      <template v-else>
        <form @submit.prevent="performLogin">
          <ion-list>
            <ion-item>
              <ion-label position="stacked">Email</ion-label>
              <ion-input type="email" v-model="email" required></ion-input>
            </ion-item>
            <ion-item>
              <ion-label position="stacked">Password</ion-label>
              <ion-input
                type="password"
                v-model="password"
                required
              ></ion-input>
            </ion-item>
          </ion-list>
          <div class="ion-padding">
            <ion-button type="submit" expand="block" :disabled="auth.isLoading">
              <ion-spinner
                v-if="auth.isLoading"
                name="crescent"
                slot="start"
              ></ion-spinner>
              Login
            </ion-button>
            <ion-text
              color="danger"
              v-if="auth.error"
              class="ion-padding-top"
              >{{ auth.error }}</ion-text
            >
          </div>
        </form>
      </template>
    </ion-content>
  </ion-page>
</template>
<script lang="ts" setup>
import { ref, computed, onMounted } from "vue";
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonInput,
  IonButton,
  IonText,
  IonSpinner,
} from "@ionic/vue";
import { useRouter, useRoute } from "vue-router";
import { useAuthStore } from "@/stores/rbacStore";
import { getAuthProvider } from "@/services/auth";

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const authProvider = getAuthProvider();

const email = ref("");
const password = ref("");
const isOidcProvider = computed(() => authProvider.isOidcProvider);

const oidcProviderLabel = computed(() => {
  const provider = import.meta.env.VITE_AUTH_PROVIDER || "";
  const labels: Record<string, string> = {
    azure_oidc: "Microsoft",
    google_oidc: "Google",
    auth0: "Auth0",
  };
  return labels[provider] || "SSO";
});

function navigateAfterLogin() {
  const redirectPath = (route.query.redirect as string) || "/app/admin/organizations";
  router.push(redirectPath);
}

const performLogin = async () => {
  const success = await auth.login({
    email: email.value,
    password: password.value,
  });
  if (success) {
    navigateAfterLogin();
  }
};

const performOidcLogin = async () => {
  await auth.loginOidc();
};

onMounted(async () => {
  if (!isOidcProvider.value) return;
  // main.ts already called handleRedirectPromise() before mount and stored
  // the token in localStorage. rbacStore reads it on creation and auto-initializes.
  // We just need to wait for initialization to complete, then navigate if authenticated.
  if (auth.isAuthenticated) {
    // Token was picked up from localStorage (set by main.ts pre-mount processing).
    // Wait for RBAC initialization to complete before navigating.
    await auth.initialize();
    navigateAfterLogin();
  }
});
</script>
<style scoped>
.ion-padding-top {
  display: block; /* Make ion-text block to allow padding-top */
  padding-top: 8px;
}
.ion-padding {
  padding-top: 16px;
}
.ion-margin-top {
  margin-top: 16px;
}
</style>
