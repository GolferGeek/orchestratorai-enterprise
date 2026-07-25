<template>
  <div class="auth-callback">
    <p>{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRbacStore } from "@/stores/rbacStore";

const auth = useRbacStore();
const message = ref("Signing you in…");

onMounted(async () => {
  // The OIDC provider redirected back here with an auth code in the URL.
  // Exchange it for a session, then hand off to the app (full reload so the
  // store re-initializes from the freshly persisted token).
  const success = await auth.handleOidcCallback();
  window.location.assign(success ? "/app/dashboard" : "/login");
});
</script>

<style scoped>
.auth-callback {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  font-size: 1rem;
}
</style>
