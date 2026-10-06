<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { IonPage } from '@ionic/vue';
import { consentApi } from '../api';
import { errorText } from '../format';
import type { ConsentRequest, OrderPolicy } from '../types';

/**
 * "Log in with <company>": an outside agent (ChatGPT, Claude, Codex) sent the
 * person here to connect. They are signed in (the router saw to that), see
 * which app is asking, pick the customer account it acts for and what it may
 * do about orders, and allow or decline. The app then gets an agent key.
 */
const route = useRoute();
const request = computed<Record<string, string>>(() =>
  Object.fromEntries(Object.entries(route.query).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
);

const described = ref<ConsentRequest | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);
const orgSlug = ref('');
const accountRef = ref('');
const orderPolicy = ref<OrderPolicy>('approve_each');
const perOrder = ref('');
const monthly = ref('');
const validDays = ref('90');

const POLICY_LABELS: Record<OrderPolicy, string> = {
  none: 'It cannot order; it can only look and ask',
  approve_each: 'Each order waits for my OK',
  auto_within_limits: 'It may order on its own, within the limits below',
};

const ready = computed(() => (described.value && 'client' in described.value ? described.value : null));
const shown = computed(() => (described.value && 'show' in described.value ? described.value.show : null));

function go(answer: { redirect: string } | { show: string }) {
  if ('redirect' in answer) window.location.assign(answer.redirect);
  else described.value = answer;
}

async function load(org?: string) {
  error.value = null;
  try {
    const answer = await consentApi.describe(request.value, org);
    if ('redirect' in answer) return go(answer);
    described.value = answer;
    if ('client' in answer) {
      orgSlug.value = answer.orgSlug;
      accountRef.value = answer.accounts.length === 1 ? answer.accounts[0]!.ref : '';
    }
  } catch (e) {
    error.value = errorText(e);
  }
}

/** Dollars typed by a person, as cents; empty means no limit. */
function centsOf(value: string): number | null {
  const trimmed = value.replace(/[$,\s]/g, '');
  if (!trimmed) return null;
  const dollars = Number(trimmed);
  if (!Number.isFinite(dollars) || dollars < 0) throw new Error(`"${value}" is not an amount in dollars`);
  return Math.round(dollars * 100);
}

async function allow() {
  error.value = null;
  busy.value = true;
  try {
    go(
      await consentApi.allow(request.value, {
        orgSlug: orgSlug.value,
        accountRef: accountRef.value,
        agentName: null,
        orderPolicy: orderPolicy.value,
        perOrderLimitCents: centsOf(perOrder.value),
        monthlyLimitCents: centsOf(monthly.value),
        validDays: validDays.value.trim() ? Number(validDays.value) : null,
      }),
    );
  } catch (e) {
    error.value = errorText(e);
  } finally {
    busy.value = false;
  }
}

async function decline() {
  error.value = null;
  busy.value = true;
  try {
    go(await consentApi.deny(request.value));
  } catch (e) {
    error.value = errorText(e);
  } finally {
    busy.value = false;
  }
}

onMounted(() => load());

const inputClass =
  'w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500';
</script>

<template>
  <!-- IonPage registers this view with the root ion-router-outlet (without it Ionic keeps it invisible);
       the inner div scrolls, since IonPage clips overflow. -->
  <ion-page>
  <div class="h-full overflow-y-auto bg-gray-950 flex items-start justify-center px-4 py-12">
    <div class="w-full max-w-lg bg-gray-900 border border-gray-700 rounded-lg p-6 space-y-5">
      <div v-if="error" class="text-sm text-red-300 bg-red-900/30 border border-red-800 rounded px-3 py-2" data-test="error">{{ error }}</div>

      <p v-if="shown" class="text-sm text-gray-300" data-test="shown">{{ shown }}</p>

      <template v-else-if="ready">
        <div>
          <h1 class="text-xl font-bold text-white">Connect {{ ready.client.name }}</h1>
          <p class="text-sm text-gray-400 mt-1">
            <span class="text-gray-200">{{ ready.client.name }}</span>
            <a v-if="ready.client.uri" :href="ready.client.uri" class="text-blue-400 ml-1" target="_blank" rel="noopener">({{ ready.client.uri }})</a>
            wants to act for one of your accounts: look things up, ask questions and, if you allow it, place orders. It gets its own key; you can revoke it at any time.
          </p>
        </div>

        <div v-if="ready.organizations.length > 1">
          <label class="block text-xs text-gray-400 mb-1">Organization</label>
          <select v-model="orgSlug" :class="inputClass" @change="load(orgSlug)">
            <option v-for="o in ready.organizations" :key="o.slug" :value="o.slug">{{ o.name }}</option>
          </select>
        </div>

        <div>
          <label class="block text-xs text-gray-400 mb-1">Account it acts for</label>
          <p v-if="ready.accounts.length === 0" class="text-sm text-gray-300">You have no account here an agent can act for.</p>
          <select v-else v-model="accountRef" :class="inputClass" data-test="account">
            <option value="" disabled>Choose an account</option>
            <option v-for="a in ready.accounts" :key="a.ref" :value="a.ref">{{ a.label }}</option>
          </select>
        </div>

        <div>
          <label class="block text-xs text-gray-400 mb-1">Orders</label>
          <select v-model="orderPolicy" :class="inputClass">
            <option v-for="(label, policy) in POLICY_LABELS" :key="policy" :value="policy">{{ label }}</option>
          </select>
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block text-xs text-gray-400 mb-1">Per order ($)</label>
            <input v-model="perOrder" :class="inputClass" inputmode="decimal" placeholder="no limit" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Per month ($)</label>
            <input v-model="monthly" :class="inputClass" inputmode="decimal" placeholder="no limit" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">For (days)</label>
            <input v-model="validDays" :class="inputClass" inputmode="numeric" placeholder="no end" />
          </div>
        </div>

        <div class="flex gap-3">
          <button
            class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium disabled:opacity-50"
            :disabled="busy || !accountRef"
            data-test="allow"
            @click="allow"
          >
            Allow
          </button>
          <button class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded font-medium" :disabled="busy" data-test="decline" @click="decline">
            Decline
          </button>
        </div>
      </template>

      <p v-else-if="!error" class="text-sm text-gray-500">Loading…</p>
    </div>
  </div>
  </ion-page>
</template>
