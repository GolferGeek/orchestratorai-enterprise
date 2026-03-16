<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { IonPage, IonContent } from '@ionic/vue';
import { useAuthStore } from '@/stores/auth.store';
import { useTeamsStore } from '@/stores/teams.store';

const authStore = useAuthStore();
const teamsStore = useTeamsStore();
const router = useRouter();

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function handleLogin() {
  if (!email.value || !password.value) {
    error.value = 'Email and password required';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    // POST to Flow API auth endpoint
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value, password: password.value }),
    });

    if (!response.ok) {
      const text = await response.text();
      let msg = `Login failed (${response.status})`;
      try { msg = JSON.parse(text).message ?? msg; } catch { /* ignore */ }
      throw new Error(msg);
    }

    const data = await response.json();
    const token = data.accessToken ?? data.access_token ?? data.token;
    if (!token) throw new Error('No token received from login');

    // Decode JWT payload to extract user info
    const payload = JSON.parse(atob(token.split('.')[1]));
    const userId = payload.sub ?? '';
    const userEmail = payload.email ?? email.value;

    authStore.setToken(token, userId, userEmail);
    await authStore.loadUserContext();
    const orgs = authStore.organizations;
    if (orgs.length > 0) {
      await teamsStore.loadTeams(orgs[0].slug);
    }
    router.push('/');
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Login failed';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <ion-page>
    <ion-content>
      <div
        class="min-h-screen flex items-center justify-center"
        style="background:var(--color-bg);"
      >
        <div class="card" style="width:380px;">
          <div class="text-center mb-6">
            <div style="font-size:32px;margin-bottom:8px;">⏱</div>
            <h1 class="text-xl font-semibold">Orch-Flow</h1>
            <p class="text-sm text-muted">Sign in to your team workspace</p>
          </div>

          <form @submit.prevent="handleLogin" class="flex flex-col gap-3">
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">Email</label>
              <input
                v-model="email"
                type="email"
                class="form-input"
                style="width:100%;"
                placeholder="you@example.com"
                autocomplete="email"
                autofocus
              />
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">Password</label>
              <input
                v-model="password"
                type="password"
                class="form-input"
                style="width:100%;"
                placeholder="••••••••"
                autocomplete="current-password"
              />
            </div>

            <div v-if="error" class="text-sm" style="color:var(--color-destructive);">
              {{ error }}
            </div>

            <button type="submit" class="btn btn-primary w-full" :disabled="loading">
              <span v-if="loading" class="spinner" style="width:14px;height:14px;border-width:1.5px;" />
              {{ loading ? 'Signing in...' : 'Sign In' }}
            </button>
          </form>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>
