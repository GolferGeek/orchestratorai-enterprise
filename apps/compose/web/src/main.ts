import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import { createPinia } from "pinia";
import { IonicVue } from "@ionic/vue";
import { vPermission } from "./directives/permission";
/* Core CSS required for Ionic components to work properly */
import "@ionic/vue/css/core.css";
/* Basic CSS for apps built with Ionic */
import "@ionic/vue/css/normalize.css";
import "@ionic/vue/css/structure.css";
import "@ionic/vue/css/typography.css";
/* Optional CSS utils that can be commented out */
import "@ionic/vue/css/padding.css";
import "@ionic/vue/css/float-elements.css";
import "@ionic/vue/css/text-alignment.css";
import "@ionic/vue/css/text-transformation.css";
import "@ionic/vue/css/flex-utils.css";
import "@ionic/vue/css/display.css";
/**
 * Ionic Dark Mode
 * -----------------------------------------------------
 * For more info, please see:
 * https://ionicframework.com/docs/theming/dark-mode
 */
/* @import '@ionic/vue/css/palettes/dark.always.css'; */
import "@ionic/vue/css/palettes/dark.class.css";
/* import '@ionic/vue/css/palettes/dark.system.css'; */
/* Theme variables */
import "./theme/variables.css";
import "./styles/dark-theme.css";
/* OAI shared theme — brand tokens + Ionic dark/light overrides */
import '@orchestratorai/ui/theme/brand.css';
import '@orchestratorai/ui/theme/ionic-dark.css';
import '@orchestratorai/ui/theme/ionic-light.css';
import { applyThemeEarly } from '@orchestratorai/ui/theme';
applyThemeEarly();

type ProviderSelector =
  | "VITE_AUTH_PROVIDER"
  | "VITE_CONFIG_PROVIDER"
  | "VITE_DB_PROVIDER"
  | "VITE_STORAGE_PROVIDER"
  | "VITE_WORK_PROVIDER"
  | "VITE_KNOWLEDGE_PROVIDER";

const ALLOWED_PROVIDER_VALUES: Record<ProviderSelector, string[]> = {
  VITE_AUTH_PROVIDER: ["supabase", "auth0", "azure_oidc", "google_oidc"],
  VITE_CONFIG_PROVIDER: ["local", "azure_keyvault", "gcp_secret_manager"],
  VITE_DB_PROVIDER: ["supabase_pg", "sqlserver", "postgresql"],
  VITE_STORAGE_PROVIDER: ["supabase_storage", "azure_blob", "gcs"],
  VITE_WORK_PROVIDER: ["flow", "slack", "ado"],
  VITE_KNOWLEDGE_PROVIDER: ["none", "notebooklm", "internal"],
};

function validateWebProviderSelectors(): void {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const selector of Object.keys(
    ALLOWED_PROVIDER_VALUES,
  ) as ProviderSelector[]) {
    const value = import.meta.env[selector];
    const allowed = ALLOWED_PROVIDER_VALUES[selector];

    if (!value || value.trim() === "") {
      missing.push(`${selector} (allowed: ${allowed.join(", ")})`);
      continue;
    }

    if (!allowed.includes(value)) {
      invalid.push(`${selector}='${value}' (allowed: ${allowed.join(", ")})`);
    }
  }

  if (invalid.length > 0) {
    throw new Error(
      `Invalid web provider selectors:\n- ${invalid.join("\n- ")}`,
    );
  }

  if (missing.length > 0) {
    const message =
      `Missing web provider selectors:\n- ${missing.join("\n- ")}\n` +
      "Set these in your selected env profile for explicit web profile behavior.";

    if (import.meta.env.PROD) {
      throw new Error(message);
    }

    console.warn(message);
  }
}

validateWebProviderSelectors();

// Process OIDC redirect BEFORE mounting the app.
// Microsoft redirects back to "/" with a hash fragment. If we let the router run
// first, it redirects to /login and strips the hash — MSAL never sees it.
// MSAL's handleRedirectPromise() must be called unconditionally — it detects
// whether a redirect response is present and returns null if not.
async function processOidcRedirectBeforeMount(): Promise<void> {
  const authProvider = import.meta.env.VITE_AUTH_PROVIDER;
  if (
    authProvider !== "azure_oidc" &&
    authProvider !== "auth0" &&
    authProvider !== "google_oidc"
  )
    return;

  console.log(
    "[OIDC pre-mount] Processing redirect. URL:",
    window.location.href,
  );
  console.log(
    "[OIDC pre-mount] Hash:",
    window.location.hash
      ? window.location.hash.substring(0, 80) + "..."
      : "(none)",
  );

  const { getAuthProvider } = await import("./services/auth");
  const provider = getAuthProvider();
  const result = await provider.handleCallback();
  console.log(
    "[OIDC pre-mount] handleCallback result:",
    result ? `token(${result.accessToken?.length} chars)` : "null",
  );

  if (result) {
    // Store the token so rbacStore sees it on init
    localStorage.setItem("authToken", result.accessToken);
    if (result.refreshToken) {
      localStorage.setItem("refreshToken", result.refreshToken);
    }
    const { tokenStorage } = await import("./services/tokenStorageService");
    await tokenStorage.setAccessToken(result.accessToken);
    if (result.refreshToken) {
      await tokenStorage.setRefreshToken(result.refreshToken);
    }
    console.log(
      "[OIDC pre-mount] Token stored in localStorage and tokenStorage",
    );
  }
}

processOidcRedirectBeforeMount().then(() => {
  const app = createApp(App).use(IonicVue).use(router).use(createPinia());

  // Register RBAC permission directive
  app.directive("permission", vPermission);

  router.isReady().then(() => {
    app.mount("#app");
  });
});
