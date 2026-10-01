<script setup lang="ts">
import ModulePage from '@/shared/layout/ModulePage.vue';
import { onMounted, ref } from 'vue';
import { gatehouseApi } from '../api';
import ErrorBanner from '../components/ErrorBanner.vue';
import StateBadge from '../components/StateBadge.vue';
import { errorText, formatTime } from '../format';
import type { Caller } from '../types';

const callers = ref<Caller[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const registering = ref(false);
const name = ref('');
const cardUrl = ref('');
const jwks = ref('');

const inputClass =
  'w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500';

async function load() {
  loading.value = true;
  error.value = null;
  try {
    callers.value = await gatehouseApi.callers();
  } catch (e) {
    error.value = errorText(e);
  } finally {
    loading.value = false;
  }
}

async function register() {
  error.value = null;
  let keys: unknown;
  try {
    keys = JSON.parse(jwks.value);
  } catch {
    error.value = 'The public keys must be a JWK set as JSON: {"keys": [...]}';
    return;
  }
  try {
    await gatehouseApi.registerCaller({ name: name.value.trim(), cardUrl: cardUrl.value.trim(), jwks: keys });
    registering.value = false;
    name.value = cardUrl.value = jwks.value = '';
    await load();
  } catch (e) {
    error.value = errorText(e);
  }
}

async function setStatus(caller: Caller, status: Caller['status']) {
  error.value = null;
  try {
    const updated = await gatehouseApi.setCallerStatus(caller.id, status);
    callers.value = callers.value.map((c) => (c.id === updated.id ? updated : c));
  } catch (e) {
    error.value = errorText(e);
  }
}

async function remove(caller: Caller) {
  if (!window.confirm(`Remove ${caller.name}? It will have to register again to call.`)) return;
  error.value = null;
  try {
    await gatehouseApi.deleteCaller(caller.id);
    callers.value = callers.value.filter((c) => c.id !== caller.id);
  } catch (e) {
    error.value = errorText(e);
  }
}

onMounted(load);
</script>

<template>
  <ModulePage>
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-white">Callers</h1>
          <p class="text-gray-400 text-sm mt-1">
            Partner agents that may call our A2A agents. A caller is known by its agent card URL and proves it with a token signed by one of its public keys. Callers are shared by every organization, so only an admin of every organization manages them.
          </p>
        </div>
        <div class="flex gap-2">
          <button class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded font-medium" :disabled="loading" @click="load">Refresh</button>
          <button v-if="!registering" class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium" @click="registering = true">
            Register a caller
          </button>
        </div>
      </div>

      <ErrorBanner :message="error" />

      <form v-if="registering" class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6 space-y-4" @submit.prevent="register">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs text-gray-400 mb-1">Name</label>
            <input v-model="name" :class="inputClass" required />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Agent card URL (https)</label>
            <input v-model="cardUrl" :class="inputClass" required placeholder="https://partner.example/.well-known/agent-card.json" />
          </div>
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Public keys, as a JWK set (public keys only)</label>
          <textarea v-model="jwks" :class="[inputClass, 'font-mono']" rows="5" required placeholder='{"keys": [{"kty": "EC", "crv": "P-256", "x": "...", "y": "...", "kid": "...", "alg": "ES256"}]}' />
        </div>
        <p class="text-xs text-gray-500">A partner can also register itself at /api/gatehouse/callers/register with a token signed by the key it registers.</p>
        <div class="flex gap-3">
          <button type="submit" class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium">Register</button>
          <button type="button" class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded font-medium" @click="registering = false">Cancel</button>
        </div>
      </form>

      <div class="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
        <div class="px-4 py-2 border-b border-gray-700 text-xs text-gray-400">{{ callers.length }} callers</div>
        <div v-if="loading" class="px-4 py-8 text-center text-gray-500 text-sm">Loading...</div>
        <div v-else-if="callers.length === 0 && !error" class="px-4 py-8 text-center text-gray-600 text-sm italic">No callers registered yet</div>
        <table v-else-if="callers.length > 0" class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
              <th class="text-left px-4 py-2">Caller</th>
              <th class="text-left px-4 py-2">Keys</th>
              <th class="text-left px-4 py-2">Status</th>
              <th class="text-left px-4 py-2">Last call</th>
              <th class="text-left px-4 py-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800">
            <tr v-for="caller in callers" :key="caller.id">
              <td class="px-4 py-2">
                <div class="text-white">{{ caller.name }}</div>
                <div class="text-gray-500 font-mono text-xs">{{ caller.cardUrl }}</div>
                <div class="text-gray-500 text-xs">Registered by {{ caller.registeredBy }} · {{ caller.rateLimitPerMinute }} calls a minute</div>
              </td>
              <td class="px-4 py-2 text-gray-300 text-xs">
                {{ caller.jwksUrl ? 'From its key set URL' : `${caller.keyIds.length} key(s)` }}
              </td>
              <td class="px-4 py-2"><StateBadge :state="caller.status" /></td>
              <td class="px-4 py-2 text-gray-400 font-mono text-xs whitespace-nowrap">{{ formatTime(caller.lastSeenAt) }}</td>
              <td class="px-4 py-2 text-right whitespace-nowrap">
                <button
                  class="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded font-medium"
                  @click="setStatus(caller, caller.status === 'active' ? 'suspended' : 'active')"
                >
                  {{ caller.status === 'active' ? 'Suspend' : 'Reinstate' }}
                </button>
                <button class="ml-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded font-medium" @click="remove(caller)">Remove</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </ModulePage>
</template>
