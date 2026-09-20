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
        <!-- Persona picker: fills the form from env so visitors never type credentials -->
        <ion-segment
          v-if="personas.length > 0"
          :value="selectedPersona"
          class="persona-picker"
          @ionChange="selectPersona(String($event.detail.value))"
        >
          <ion-segment-button
            v-for="persona in personas"
            :key="persona.key"
            :value="persona.key"
            :data-testid="`login-persona-${persona.key}`"
          >
            <ion-label>{{ persona.label }}</ion-label>
          </ion-segment-button>
        </ion-segment>
        <form @submit.prevent="performLogin">
          <ion-list>
            <ion-item>
              <ion-label position="stacked">Email</ion-label>
              <ion-input
                aria-label="Email"
                autocomplete="email"
                inputmode="email"
                name="email"
                type="email"
                v-model="email"
                required
              ></ion-input>
            </ion-item>
            <ion-item>
              <ion-label position="stacked">Password</ion-label>
              <ion-input
                aria-label="Password"
                autocomplete="current-password"
                name="password"
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
  IonSegment,
  IonSegmentButton,
} from "@ionic/vue";
import { useRoute } from "vue-router";
import { useRbacStore } from "@/stores/rbacStore";
import { getAuthProvider } from "@/services/auth";

const route = useRoute();
const auth = useRbacStore();
const authProvider = getAuthProvider();

interface LoginPersona {
  key: "demo" | "admin";
  label: string;
  email: string;
  password: string;
}

// Personas come from env (VITE_DEMO_USER_* / VITE_ADMIN_USER_*). Only fully
// configured personas are offered; with none configured the form starts empty.
const personas: LoginPersona[] = (
  [
    {
      key: "demo",
      label: "Demo",
      email: import.meta.env.VITE_DEMO_USER_EMAIL,
      password: import.meta.env.VITE_DEMO_USER_PASSWORD,
    },
    {
      key: "admin",
      label: "Admin",
      email: import.meta.env.VITE_ADMIN_USER_EMAIL,
      password: import.meta.env.VITE_ADMIN_USER_PASSWORD,
    },
  ] as const
)
  .filter((persona) => Boolean(persona.email) && Boolean(persona.password))
  .map((persona) => ({
    key: persona.key,
    label: persona.label,
    email: String(persona.email),
    password: String(persona.password),
  }));

const selectedPersona = ref<LoginPersona["key"] | undefined>(personas[0]?.key);
const email = ref(personas[0]?.email ?? "");
const password = ref(personas[0]?.password ?? "");

function selectPersona(key: string) {
  const persona = personas.find((candidate) => candidate.key === key);
  if (!persona) {
    throw new Error(`Unknown login persona: ${key}`);
  }
  selectedPersona.value = persona.key;
  email.value = persona.email;
  password.value = persona.password;
}

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
  const redirectPath = (route.query.redirect as string) || "/app/dashboard";
  window.location.assign(redirectPath);
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
.persona-picker {
  margin-bottom: 16px;
}
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
