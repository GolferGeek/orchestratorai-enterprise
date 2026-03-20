<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.store';

const router = useRouter();
const authStore = useAuthStore();

const email = ref('');
const password = ref('');
const errorMessage = ref('');
const isLoading = ref(false);

async function handleSubmit(): Promise<void> {
  errorMessage.value = '';
  isLoading.value = true;

  try {
    await authStore.login(email.value, password.value);
    await router.push('/');
  } catch (err: unknown) {
    if (err instanceof Error) {
      errorMessage.value = err.message;
    } else {
      errorMessage.value = 'An unexpected error occurred. Please try again.';
    }
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-900 flex items-start justify-center">
    <div class="bg-gray-800 rounded-lg shadow-xl p-8 w-full max-w-md mx-auto mt-20">
      <!-- App title -->
      <div class="text-center mb-8">
        <div class="text-3xl font-bold text-white mb-2">Agent Communication</div>
        <div class="text-lg text-gray-400">Protocol Playground</div>
      </div>

      <!-- Login form -->
      <form @submit.prevent="handleSubmit" novalidate>
        <!-- Email field -->
        <div class="mb-5">
          <label for="email" class="block text-sm text-gray-300 mb-1">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            autocomplete="email"
            required
            placeholder="you@example.com"
            class="bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded px-4 py-2 w-full focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <!-- Password field -->
        <div class="mb-6">
          <label for="password" class="block text-sm text-gray-300 mb-1">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            placeholder="••••••••"
            class="bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded px-4 py-2 w-full focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <!-- Error message -->
        <div v-if="errorMessage" class="mb-4 text-red-400 text-sm">
          {{ errorMessage }}
        </div>

        <!-- Submit button -->
        <button
          type="submit"
          :disabled="isLoading"
          class="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold rounded px-4 py-2 w-full transition-colors duration-150"
        >
          <span v-if="isLoading">Logging in...</span>
          <span v-else>Log In</span>
        </button>
      </form>
    </div>
  </div>
</template>
