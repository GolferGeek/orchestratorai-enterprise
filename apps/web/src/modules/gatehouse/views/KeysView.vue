<script setup lang="ts">
import ModulePage from '@/shared/layout/ModulePage.vue';
import { onMounted, ref } from 'vue';
import { gatehouseApi } from '../api';
import ErrorBanner from '../components/ErrorBanner.vue';
import { errorText, formatTime } from '../format';
import type { AgentKey, OrderPolicy } from '../types';

/**
 * Agent keys: credentials the company issues to an outside agent (a buyer's
 * ChatGPT, Claude or script) for one of its customer accounts, with what the
 * agent may do about orders. The key is shown once, when it is issued.
 */
const keys = ref<AgentKey[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const issuing = ref(false);
const issued = ref<{ grant: AgentKey; key: string } | null>(null);

const agentName = ref('');
const accountRef = ref('');
const accountLabel = ref('');
const orderPolicy = ref<OrderPolicy>('approve_each');
const perOrder = ref('');
const monthly = ref('');
const validDays = ref('90');

const POLICY_LABELS: Record<OrderPolicy, string> = {
  none: 'Cannot order',
  approve_each: 'Each order needs the account owner’s OK',
  auto_within_limits: 'Orders on its own within the limits',
};

const inputClass =
  'w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500';

/** Dollars typed by a person, as cents; empty means no limit. */
function centsOf(value: string): number | null {
  const trimmed = value.replace(/[$,\s]/g, '');
  if (!trimmed) return null;
  const dollars = Number(trimmed);
  if (!Number.isFinite(dollars) || dollars < 0) throw new Error(`"${value}" is not an amount in dollars`);
  return Math.round(dollars * 100);
}

const money = (cents: number | null) => (cents === null ? 'no limit' : `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

function state(key: AgentKey): string {
  if (key.revokedAt) return 'revoked';
  if (key.validUntil && Date.parse(key.validUntil) <= Date.now()) return 'expired';
  return 'active';
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    keys.value = await gatehouseApi.keys();
  } catch (e) {
    error.value = errorText(e);
  } finally {
    loading.value = false;
  }
}

async function issue() {
  error.value = null;
  let perOrderLimitCents: number | null;
  let monthlyLimitCents: number | null;
  try {
    perOrderLimitCents = centsOf(perOrder.value);
    monthlyLimitCents = centsOf(monthly.value);
  } catch (e) {
    error.value = errorText(e);
    return;
  }
  const days = validDays.value.trim() ? Number(validDays.value) : null;
  try {
    issued.value = await gatehouseApi.issueKey({
      agentName: agentName.value.trim(),
      accountRef: accountRef.value.trim(),
      accountLabel: accountLabel.value.trim(),
      orderPolicy: orderPolicy.value,
      perOrderLimitCents,
      monthlyLimitCents,
      validDays: days,
    });
    issuing.value = false;
    agentName.value = accountRef.value = accountLabel.value = perOrder.value = monthly.value = '';
    orderPolicy.value = 'approve_each';
    validDays.value = '90';
    await load();
  } catch (e) {
    error.value = errorText(e);
  }
}

async function revoke(key: AgentKey) {
  if (!window.confirm(`Revoke the key for ${key.agentName} (${key.accountLabel})? The agent can no longer call.`)) return;
  error.value = null;
  try {
    const updated = await gatehouseApi.revokeKey(key.id);
    keys.value = keys.value.map((k) => (k.id === updated.id ? updated : k));
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
          <h1 class="text-2xl font-bold text-white">Agent keys</h1>
          <p class="text-gray-400 text-sm mt-1">
            Keys for outside agents, such as a customer's ChatGPT, Claude or their own script, that cannot sign with a registered key. Each key acts for one of your customer accounts, carries what it may do about orders, and can be revoked at any time.
          </p>
        </div>
        <div class="flex gap-2">
          <button class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded font-medium" :disabled="loading" @click="load">Refresh</button>
          <button v-if="!issuing" class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium" @click="issuing = true; issued = null">
            Issue a key
          </button>
        </div>
      </div>

      <ErrorBanner :message="error" />

      <div v-if="issued" class="bg-green-900/30 border border-green-700 rounded-lg p-4 mb-6" data-test="issued-key">
        <div class="text-sm text-green-300 font-medium">Key issued for {{ issued.grant.agentName }} ({{ issued.grant.accountLabel }})</div>
        <p class="text-xs text-gray-300 mt-1">Copy it now and give it to the agent's owner. It is not stored and will not be shown again.</p>
        <code class="block mt-2 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-xs text-white break-all select-all">{{ issued.key }}</code>
        <p class="text-xs text-gray-400 mt-2">The agent sends it as <span class="font-mono">Authorization: Bearer &lt;key&gt;</span> to your published A2A agents.</p>
        <button class="mt-3 px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded font-medium" @click="issued = null">Done</button>
      </div>

      <form v-if="issuing" class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6 space-y-4" @submit.prevent="issue">
        <div class="grid grid-cols-3 gap-4">
          <div>
            <label class="block text-xs text-gray-400 mb-1">Agent name</label>
            <input v-model="agentName" :class="inputClass" required maxlength="80" placeholder="Acme's purchasing assistant" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Customer account</label>
            <input v-model="accountLabel" :class="inputClass" required maxlength="200" placeholder="Acme Labs" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Account reference (your customer id)</label>
            <input v-model="accountRef" :class="[inputClass, 'font-mono']" required maxlength="200" placeholder="client-42" />
          </div>
        </div>
        <div class="grid grid-cols-4 gap-4">
          <div>
            <label class="block text-xs text-gray-400 mb-1">Orders</label>
            <select v-model="orderPolicy" :class="inputClass">
              <option v-for="(label, policy) in POLICY_LABELS" :key="policy" :value="policy">{{ label }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Per order limit ($)</label>
            <input v-model="perOrder" :class="inputClass" inputmode="decimal" :required="orderPolicy === 'auto_within_limits'" placeholder="no limit" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Monthly limit ($)</label>
            <input v-model="monthly" :class="inputClass" inputmode="decimal" placeholder="no limit" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Valid for (days)</label>
            <input v-model="validDays" :class="inputClass" inputmode="numeric" placeholder="never expires" />
          </div>
        </div>
        <div class="flex gap-3">
          <button type="submit" class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium">Issue</button>
          <button type="button" class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded font-medium" @click="issuing = false">Cancel</button>
        </div>
      </form>

      <div class="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
        <div class="px-4 py-2 border-b border-gray-700 text-xs text-gray-400">{{ keys.length }} keys</div>
        <div v-if="loading" class="px-4 py-8 text-center text-gray-500 text-sm">Loading...</div>
        <div v-else-if="keys.length === 0 && !error" class="px-4 py-8 text-center text-gray-600 text-sm italic">No agent keys issued yet</div>
        <table v-else-if="keys.length > 0" class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
              <th class="text-left px-4 py-2">Agent</th>
              <th class="text-left px-4 py-2">Account</th>
              <th class="text-left px-4 py-2">Orders</th>
              <th class="text-left px-4 py-2">State</th>
              <th class="text-left px-4 py-2">Last call</th>
              <th class="text-left px-4 py-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800">
            <tr v-for="key in keys" :key="key.id" data-test="key-row">
              <td class="px-4 py-2">
                <div class="text-white">{{ key.agentName }}</div>
                <div class="text-gray-500 font-mono text-xs">{{ key.tokenPrefix }}…</div>
              </td>
              <td class="px-4 py-2">
                <div class="text-gray-300">{{ key.accountLabel }}</div>
                <div class="text-gray-500 font-mono text-xs">{{ key.accountRef }}</div>
              </td>
              <td class="px-4 py-2 text-xs text-gray-300">
                <div>{{ POLICY_LABELS[key.orderPolicy] }}</div>
                <div class="text-gray-500">{{ money(key.perOrderLimitCents) }} an order · {{ money(key.monthlyLimitCents) }} a month</div>
              </td>
              <td class="px-4 py-2 text-xs">
                <span :class="state(key) === 'active' ? 'text-green-400' : 'text-gray-500'">{{ state(key) }}</span>
                <div v-if="key.validUntil" class="text-gray-500">until {{ formatTime(key.validUntil) }}</div>
              </td>
              <td class="px-4 py-2 text-gray-400 font-mono text-xs whitespace-nowrap">{{ formatTime(key.lastUsedAt) }}</td>
              <td class="px-4 py-2 text-right whitespace-nowrap">
                <button
                  v-if="state(key) === 'active'"
                  class="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded font-medium"
                  @click="revoke(key)"
                >
                  Revoke
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </ModulePage>
</template>
